"use client";

import {
  BadgeCheck,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Fingerprint,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Wallet
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { proofpayDeployment, stellarExpertTxUrl } from "@/lib/app-config";
import { networkConfig, proofPublicInputOrder, shortHex } from "@/lib/demo-data";
import {
  decodeClaimPayload,
  type ClaimLinkPayload
} from "@/lib/claim-link";
import {
  connectFreighterWallet,
  freighterSigner,
  shortAddress,
  type WalletState
} from "@/lib/freighter-wallet";
import {
  base64ToBuffer,
  makeProofPayClient
} from "@/lib/proofpay-client";
import type { CanonicalInvoice } from "@/lib/invoice-proof";
import type { DemoCredential } from "@/lib/demo-data";

type BusyAction = "wallet" | "validate" | "proof" | "release";

type ProofPayload = {
  proofStatus: "ready";
  credential: DemoCredential;
  invoice: CanonicalInvoice;
  eligibility: {
    qualified: boolean;
    totalGapCents: number;
    countGap: number;
  };
  publicInputOrder: readonly string[];
  publicInputs: Record<string, string | undefined>;
  artifacts: {
    proofBytesBase64: string;
    publicInputsBase64: string;
    proofByteLength: number;
    publicInputByteLength: number;
  };
};

type ValidationState =
  | { status: "idle" | "checking" }
  | { status: "valid"; released: boolean }
  | { status: "invalid"; message: string };

const initialWallet: WalletState = {
  status: "idle",
  message: "Connect Freighter to release the funded escrow."
};

export default function ClaimPage() {
  const params = useParams<{ invoiceId: string }>();
  const searchParams = useSearchParams();
  const encodedPayload = searchParams.get("p") ?? "";
  const [wallet, setWallet] = useState<WalletState>(initialWallet);
  const [payload, setPayload] = useState<ClaimLinkPayload>();
  const [validation, setValidation] = useState<ValidationState>({ status: "idle" });
  const [proof, setProof] = useState<ProofPayload>();
  const [releaseTx, setReleaseTx] = useState<string>();
  const [busy, setBusy] = useState<BusyAction>();
  const [notice, setNotice] = useState("Validating the funded claim link.");
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;

    async function validateClaimLink() {
      setBusy("validate");
      setValidation({ status: "checking" });
      setError(undefined);

      try {
        const nextPayload = decodeClaimPayload(encodedPayload);
        if (nextPayload.invoiceId !== params.invoiceId) {
          throw new Error("Claim link invoice id does not match this route.");
        }
        if (nextPayload.contractId !== proofpayDeployment.contractId) {
          throw new Error("Claim link points to a different ProofPay contract.");
        }

        const client = makeProofPayClient(nextPayload.payee);
        const tx = await client.get_invoice({
          invoice_id: BigInt(nextPayload.invoiceId)
        });
        const invoice = tx.result;
        if (!invoice) {
          throw new Error("Escrow invoice was not found on Stellar testnet.");
        }

        const mismatch = invoiceMismatch(nextPayload, invoice);
        if (mismatch) throw new Error(mismatch);
        if (!invoice.funded) {
          throw new Error("Escrow invoice exists, but it is not funded yet.");
        }

        if (!cancelled) {
          setPayload(nextPayload);
          setValidation({ status: "valid", released: invoice.released });
          setNotice(
            invoice.released
              ? "This escrow has already been released."
              : "Funded escrow validated. Generate a private proof to claim it."
          );
        }
      } catch (caught) {
        if (!cancelled) {
          const message = readError(caught);
          setValidation({ status: "invalid", message });
          setError(message);
          setNotice("Claim link validation failed.");
        }
      } finally {
        if (!cancelled) setBusy(undefined);
      }
    }

    validateClaimLink();
    return () => {
      cancelled = true;
    };
  }, [encodedPayload, params.invoiceId]);

  const walletConnected = wallet.status === "connected";
  const proofReady = proof?.proofStatus === "ready";
  const released = validation.status === "valid" && validation.released;
  const primaryAction = getClaimAction({
    busy,
    connectWallet,
    generateProof,
    proofReady,
    releaseEscrow,
    released: Boolean(released || releaseTx),
    valid: validation.status === "valid",
    walletConnected,
    walletStatus: wallet.status
  });

  const proofDelta = useMemo(() => {
    if (!proof) return undefined;
    const totalGap = proof.eligibility.totalGapCents;
    return {
      totalLabel:
        totalGap >= 0
          ? `+$${Math.floor(totalGap / 100).toLocaleString()}`
          : `-$${Math.abs(Math.floor(totalGap / 100)).toLocaleString()}`,
      countLabel: `${proof.eligibility.countGap >= 0 ? "+" : ""}${proof.eligibility.countGap}`
    };
  }, [proof]);

  async function connectWallet() {
    setBusy("wallet");
    setError(undefined);
    setNotice("Opening Freighter permission request.");

    try {
      const nextWallet = await connectFreighterWallet();
      setWallet(nextWallet);
      setNotice(nextWallet.message);
      if (nextWallet.status !== "connected") {
        setError(nextWallet.message);
      }
    } catch (caught) {
      setError(readError(caught));
      setNotice("Wallet connection failed.");
    } finally {
      setBusy(undefined);
    }
  }

  async function generateProof() {
    if (!payload || validation.status !== "valid") return;
    setBusy("proof");
    setError(undefined);
    setNotice("Generating a private proof for this funded invoice.");

    try {
      const response = await fetch("/api/proof/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          persona: "qualified",
          client: payload.client,
          project: payload.project,
          payer: payload.payer,
          payee: payload.payee,
          token: payload.token,
          amountXlm: payload.amountXlm,
          minTotalCents: payload.minTotalCents,
          minPaidCount: payload.minPaidCount,
          periodBucket: payload.periodBucket,
          expiresAt: payload.expiresAt,
          invoiceHash: payload.invoiceHash
        })
      });
      const nextProof = (await response.json()) as ProofPayload & {
        message?: string;
      };
      if (!response.ok || nextProof.proofStatus !== "ready") {
        throw new Error(nextProof.message ?? "Private proof is not ready.");
      }
      if (normalizeField(nextProof.publicInputs.invoice_hash ?? "") !== normalizeField(payload.invoiceHash)) {
        throw new Error("Generated proof does not match the claim link invoice.");
      }
      setProof(nextProof);
      setNotice("Proof ready. Connect Freighter and release escrow.");
    } catch (caught) {
      setError(readError(caught));
      setNotice("Proof generation failed.");
    } finally {
      setBusy(undefined);
    }
  }

  async function releaseEscrow() {
    if (!payload || !proof || wallet.status !== "connected") return;
    setBusy("release");
    setError(undefined);
    setNotice("Submitting proof to release escrow.");

    try {
      const client = makeProofPayClient(
        wallet.address,
        freighterSigner(wallet.address)
      );
      const tx = await client.verify_and_release({
        invoice_id: BigInt(payload.invoiceId),
        public_inputs: base64ToBuffer(proof.artifacts.publicInputsBase64),
        proof_bytes: base64ToBuffer(proof.artifacts.proofBytesBase64)
      });
      const sent = await tx.signAndSend();
      sent.result.unwrap();

      setReleaseTx(sent.sendTransactionResponse?.hash);
      setValidation({ status: "valid", released: true });
      setNotice("Proof verified on Stellar. Escrow released to the contractor.");
    } catch (caught) {
      setError(readError(caught));
      setNotice("Release failed.");
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <main className="appShell">
      <header className="appHeader">
        <Link className="brandLockup" aria-label="ProofPay" href="/">
          <span className="brandMark">
            <LockKeyhole size={18} />
          </span>
          <div>
            <strong>ProofPay</strong>
            <span>Private contractor trust checkout</span>
          </div>
        </Link>
        <button
          className="walletButton"
          type="button"
          onClick={connectWallet}
          disabled={busy === "wallet"}
        >
          {busy === "wallet" ? <Loader2 size={17} className="spin" /> : <Wallet size={17} />}
          <span>
            {wallet.status === "connected"
              ? shortAddress(wallet.address)
              : "Connect wallet"}
          </span>
        </button>
      </header>

      <section className="flowHero" aria-label="ProofPay claim page">
        <div className="flowPanel">
          <div className="flowHeader">
            <div>
              <p className="eyebrow">Contractor claim</p>
              <h1>Claim funded escrow privately</h1>
            </div>
            <StatusBadge tone={releaseTx || released ? "success" : "neutral"}>
              {releaseTx || released ? "Released" : networkConfig.name}
            </StatusBadge>
          </div>

          <div className="claimSummary">
            <DataPoint label="Client" value={payload?.client ?? "Validating"} />
            <DataPoint label="Project" value={payload?.project ?? "Validating"} />
            <DataPoint label="Amount" value={payload ? `${payload.amountXlm} XLM` : "Validating"} />
            <DataPoint label="Invoice" value={payload ? `#${payload.invoiceId}` : params.invoiceId} />
          </div>

          <StepList
            steps={[
              { label: "Link valid", complete: validation.status === "valid" },
              { label: "Proof ready", complete: proofReady },
              { label: "Wallet", complete: walletConnected },
              { label: "Released", complete: Boolean(releaseTx || released) }
            ]}
          />

          <button
            className="primaryAction"
            type="button"
            onClick={primaryAction.action}
            disabled={!primaryAction.action || Boolean(busy)}
          >
            {primaryAction.busy ? <Loader2 size={18} className="spin" /> : primaryAction.icon}
            <span>{primaryAction.label}</span>
          </button>

          <Notice error={error} message={notice} />
        </div>

        <aside className="claimPanel" aria-label="Private proof summary">
          <div className="proofHeader">
            <BadgeCheck size={22} />
            <div>
              <p className="eyebrow">Private proof</p>
              <h2>{proofReady ? "Credential clears policy" : "Not generated yet"}</h2>
            </div>
          </div>

          <div className="claimPreview">
            <DataPoint label="Contractor" value={payload?.credential.freelancer ?? "Verified contractor"} />
            <DataPoint label="Invoice commitment" value={shortHex(payload?.invoiceHash)} />
            <DataPoint label="Paid history margin" value={proofDelta?.totalLabel ?? "Hidden until proof"} />
            <DataPoint label="Invoice count margin" value={proofDelta?.countLabel ?? "Hidden until proof"} />
          </div>

          <div className="linkList">
            {payload?.fundTx ? (
              <ProofLink label="Funding tx" href={stellarExpertTxUrl(payload.fundTx)} />
            ) : null}
            {releaseTx ? (
              <ProofLink label="Release tx" href={stellarExpertTxUrl(releaseTx)} />
            ) : null}
          </div>
        </aside>
      </section>

      <details className="auditTrail">
        <summary>
          <span>Claim audit trail</span>
          <span>Public inputs</span>
        </summary>
        <div className="auditGrid claimAuditGrid">
          <div className="auditSection">
            <h3>Claim payload</h3>
            <KeyValue label="ProofPay contract" value={payload?.contractId} />
            <KeyValue label="Payer" value={payload?.payer} />
            <KeyValue label="Payee" value={payload?.payee} />
            <KeyValue label="Root" value={payload?.root} />
          </div>
          <div className="auditSection">
            <h3>Proof inputs</h3>
            {proofPublicInputOrder.map((item) => (
              <KeyValue
                key={item}
                label={item}
                value={shortHex(proof?.publicInputs[item] ?? payloadField(payload, item))}
              />
            ))}
          </div>
        </div>
      </details>
    </main>
  );
}

function invoiceMismatch(payload: ClaimLinkPayload, invoice: {
  amount: bigint;
  cancelled: boolean;
  expires_at: bigint;
  invoice_hash: Buffer;
  min_paid_count: number;
  min_total_cents: bigint;
  payee: string;
  payee_hash: Buffer;
  payer: string;
  period_bucket: number;
  root: Buffer;
  token: string;
}) {
  if (invoice.cancelled) return "Escrow invoice was cancelled.";
  if (invoice.payer !== payload.payer) return "Payer mismatch.";
  if (invoice.payee !== payload.payee) return "Payee mismatch.";
  if (invoice.token !== payload.token) return "Token mismatch.";
  if (invoice.amount.toString() !== payload.amountStroops) return "Amount mismatch.";
  if (invoice.min_total_cents.toString() !== String(payload.minTotalCents)) {
    return "Minimum paid history mismatch.";
  }
  if (invoice.min_paid_count !== payload.minPaidCount) return "Minimum invoice count mismatch.";
  if (invoice.period_bucket !== payload.periodBucket) return "Period mismatch.";
  if (invoice.expires_at.toString() !== String(payload.expiresAt)) return "Expiry mismatch.";
  if (bufferField(invoice.root) !== normalizeField(payload.root)) return "Issuer root mismatch.";
  if (bufferField(invoice.payee_hash) !== normalizeField(payload.payeeHash)) {
    return "Payee hash mismatch.";
  }
  if (bufferField(invoice.invoice_hash) !== normalizeField(payload.invoiceHash)) {
    return "Invoice commitment mismatch.";
  }
  return undefined;
}

function normalizeField(value: string) {
  return value.startsWith("0x") ? value.toLowerCase() : `0x${value.toLowerCase()}`;
}

function bufferField(value: Buffer) {
  return `0x${Buffer.from(value).toString("hex")}`;
}

function payloadField(payload: ClaimLinkPayload | undefined, key: string) {
  if (!payload) return undefined;
  const values: Record<string, string | undefined> = {
    root: payload.root,
    payee_hash: payload.payeeHash,
    invoice_hash: payload.invoiceHash,
    min_total_cents: `0x${BigInt(payload.minTotalCents).toString(16).padStart(64, "0")}`,
    min_paid_count: `0x${BigInt(payload.minPaidCount).toString(16).padStart(64, "0")}`,
    period_bucket: `0x${BigInt(payload.periodBucket).toString(16).padStart(64, "0")}`
  };
  return values[key];
}

function StepList({
  steps
}: {
  steps: Array<{ label: string; complete: boolean }>;
}) {
  return (
    <ol className="stepList fourSteps" aria-label="Claim progress">
      {steps.map((step) => (
        <li className={step.complete ? "complete" : ""} key={step.label}>
          <span>{step.complete ? <CheckCircle2 size={15} /> : null}</span>
          <strong>{step.label}</strong>
        </li>
      ))}
    </ol>
  );
}

function getClaimAction({
  busy,
  connectWallet,
  generateProof,
  proofReady,
  releaseEscrow,
  released,
  valid,
  walletConnected,
  walletStatus
}: {
  busy?: BusyAction;
  connectWallet: () => Promise<void>;
  generateProof: () => Promise<void>;
  proofReady: boolean;
  releaseEscrow: () => Promise<void>;
  released: boolean;
  valid: boolean;
  walletConnected: boolean;
  walletStatus: WalletState["status"];
}): {
  label: string;
  icon: ReactNode;
  action?: () => Promise<void>;
  busy: boolean;
} {
  if (released) {
    return {
      label: "Escrow released",
      icon: <CheckCircle2 size={18} />,
      busy: false
    };
  }
  if (!valid) {
    return {
      label: "Waiting for valid claim",
      icon: <ShieldCheck size={18} />,
      busy: busy === "validate"
    };
  }
  if (!proofReady) {
    return {
      label: "Generate private proof",
      icon: <Fingerprint size={18} />,
      action: generateProof,
      busy: busy === "proof"
    };
  }
  if (!walletConnected) {
    return {
      label: walletStatus === "wrong-network" ? "Retry wallet" : "Connect Freighter",
      icon: <Wallet size={18} />,
      action: connectWallet,
      busy: busy === "wallet"
    };
  }
  return {
    label: "Release escrow",
    icon: <ShieldCheck size={18} />,
    action: releaseEscrow,
    busy: busy === "release"
  };
}

function StatusBadge({
  tone,
  children
}: {
  tone: "neutral" | "success";
  children: ReactNode;
}) {
  return <span className={`statusBadge ${tone}`}>{children}</span>;
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="dataPoint">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value?: string }) {
  return (
    <div className="keyValue">
      <span>{label}</span>
      <code>{value ?? "pending"}</code>
    </div>
  );
}

function ProofLink({ label, href }: { label: string; href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      <span>{label}</span>
      <ExternalLink size={15} />
    </a>
  );
}

function Notice({ error, message }: { error?: string; message: string }) {
  return (
    <div
      className={`notice ${error ? "noticeError" : "noticeInfo"}`}
      role="status"
      aria-live="polite"
    >
      {error ? <CircleAlert size={17} /> : <ShieldCheck size={17} />}
      <span>{error ?? message}</span>
    </div>
  );
}

function readError(caught: unknown): string {
  if (caught instanceof Error) return caught.message;
  return "Something went wrong. Try again.";
}
