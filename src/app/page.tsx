"use client";

import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Wallet
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  liveProof,
  proofpayDeployment,
  stellarExpertContractUrl,
  stellarExpertTxUrl
} from "@/lib/app-config";
import {
  demoCredentials,
  demoInvoice,
  networkConfig,
  proofPublicInputOrder,
  shortHex,
  type DemoCredential,
  type DemoInvoice
} from "@/lib/demo-data";
import {
  connectFreighterWallet,
  freighterSigner,
  shortAddress,
  type WalletState
} from "@/lib/freighter-wallet";
import {
  base64ToBuffer,
  fieldHexToBuffer,
  makeProofPayClient,
  xlmToStroops
} from "@/lib/proofpay-client";

type BusyAction = "proof" | "wallet" | "create" | "fund" | "release" | "reject";

type InvoiceDraft = {
  id: string;
  client: string;
  project: string;
  payee: string;
  payeeAddress: string;
  amountXlm: string;
  minTotalCents: number;
  minPaidCount: number;
  periodBucket: number;
};

type ProofPayload = {
  proofStatus: "ready";
  credential: DemoCredential;
  invoice: DemoInvoice;
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
  contracts: typeof proofpayDeployment;
  liveProof: typeof liveProof;
};

type ChainState = {
  status: "local" | "created" | "funded" | "released";
  invoiceId?: string;
  createTx?: string;
  fundTx?: string;
  releaseTx?: string;
};

type RejectCase = {
  status: "idle" | "blocked" | "error";
  message?: string;
};

const initialWallet: WalletState = {
  status: "idle",
  message: "Connect Freighter to create and fund this escrow."
};

const initialChain: ChainState = {
  status: "local"
};

const initialInvoiceDraft: InvoiceDraft = {
  id: demoInvoice.id,
  client: "",
  project: "",
  payee: demoInvoice.payee,
  payeeAddress: demoInvoice.payeeAddress,
  amountXlm: "",
  minTotalCents: demoInvoice.minTotalCents,
  minPaidCount: demoInvoice.minPaidCount,
  periodBucket: demoInvoice.periodBucket
};

export default function Home() {
  const [invoiceDraft, setInvoiceDraft] =
    useState<InvoiceDraft>(initialInvoiceDraft);
  const [wallet, setWallet] = useState<WalletState>(initialWallet);
  const [proof, setProof] = useState<ProofPayload>();
  const [chain, setChain] = useState<ChainState>(initialChain);
  const [busy, setBusy] = useState<BusyAction>();
  const [notice, setNotice] = useState(
    `Enter client, project, and amount details, then check ${demoCredentials.qualified.freelancer}'s private work proof.`
  );
  const [error, setError] = useState<string>();
  const [rejectCase, setRejectCase] = useState<RejectCase>({ status: "idle" });

  const credential = proof?.credential ?? demoCredentials.qualified;
  const invoiceLocked = chain.status !== "local";
  const invoiceError = validateInvoiceDraft(invoiceDraft);
  const walletConnected = wallet.status === "connected";
  const proofReady = proof?.proofStatus === "ready";
  const proofDelta = useMemo(() => {
    const totalGap =
      credential.aggregateTotalCents - invoiceDraft.minTotalCents;
    const countGap = credential.paidInvoiceCount - invoiceDraft.minPaidCount;
    return {
      totalGap,
      countGap,
      totalLabel:
        totalGap >= 0
          ? `+$${Math.floor(totalGap / 100).toLocaleString()}`
          : `-$${Math.abs(Math.floor(totalGap / 100)).toLocaleString()}`,
      countLabel: `${countGap >= 0 ? "+" : ""}${countGap}`
    };
  }, [credential, invoiceDraft.minPaidCount, invoiceDraft.minTotalCents]);

  async function prepareProof() {
    setBusy("proof");
    setError(undefined);
    setNotice("Checking issuer credential without exposing raw work history.");

    try {
      const response = await fetch("/api/proof/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ persona: "qualified" })
      });
      const payload = (await response.json()) as ProofPayload & {
        message?: string;
      };

      if (!response.ok || payload.proofStatus !== "ready") {
        throw new Error(payload.message ?? "Private proof is not ready.");
      }

      setProof(payload);
      setNotice(
        `${payload.credential.freelancer} meets the client threshold. The exact revenue and client list stay private.`
      );
    } catch (caught) {
      setError(readError(caught));
      setNotice("Proof check did not complete.");
    } finally {
      setBusy(undefined);
    }
  }

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

  async function createInvoice() {
    if (!proof || wallet.status !== "connected") return;
    const validationError = validateInvoiceDraft(invoiceDraft);
    if (validationError) {
      setError(validationError);
      setNotice("Invoice creation paused.");
      return;
    }

    setBusy("create");
    setError(undefined);
    setNotice("Asking Freighter to create the escrow invoice.");

    try {
      const client = makeProofPayClient(
        wallet.address,
        freighterSigner(wallet.address)
      );
      const tx = await client.create_invoice({
        payer: wallet.address,
        payee: invoiceDraft.payeeAddress,
        token: proofpayDeployment.nativeTokenContractId,
        amount: xlmToStroops(invoiceDraft.amountXlm),
        root: fieldHexToBuffer(requiredInput(proof, "root")),
        payee_hash: fieldHexToBuffer(requiredInput(proof, "payee_hash")),
        invoice_hash: fieldHexToBuffer(requiredInput(proof, "invoice_hash")),
        min_total_cents: BigInt(invoiceDraft.minTotalCents),
        min_paid_count: invoiceDraft.minPaidCount,
        period_bucket: invoiceDraft.periodBucket,
        expires_at: BigInt(proofpayDeployment.rootExpiresAt)
      });
      const sent = await tx.signAndSend();
      const invoiceId = sent.result.unwrap().toString();

      setChain((current) => ({
        ...current,
        status: "created",
        invoiceId,
        createTx: sent.sendTransactionResponse?.hash
      }));
      setNotice(`Escrow invoice #${invoiceId} created on Stellar testnet.`);
    } catch (caught) {
      setError(readError(caught));
      setNotice("Invoice creation failed.");
    } finally {
      setBusy(undefined);
    }
  }

  async function fundInvoice() {
    if (wallet.status !== "connected" || !chain.invoiceId) return;
    setBusy("fund");
    setError(undefined);
    setNotice("Asking Freighter to fund the escrow.");

    try {
      const client = makeProofPayClient(
        wallet.address,
        freighterSigner(wallet.address)
      );
      const tx = await client.fund_invoice({
        invoice_id: BigInt(chain.invoiceId)
      });
      const sent = await tx.signAndSend();
      sent.result.unwrap();

      setChain((current) => ({
        ...current,
        status: "funded",
        fundTx: sent.sendTransactionResponse?.hash
      }));
      setNotice("Escrow funded. Payment is locked until the proof is verified.");
    } catch (caught) {
      setError(readError(caught));
      setNotice("Escrow funding failed.");
    } finally {
      setBusy(undefined);
    }
  }

  async function releasePayment() {
    if (!proof || wallet.status !== "connected" || !chain.invoiceId) return;
    setBusy("release");
    setError(undefined);
    setNotice("Submitting the proof to release payment.");

    try {
      const client = makeProofPayClient(
        wallet.address,
        freighterSigner(wallet.address)
      );
      const tx = await client.verify_and_release({
        invoice_id: BigInt(chain.invoiceId),
        public_inputs: base64ToBuffer(proof.artifacts.publicInputsBase64),
        proof_bytes: base64ToBuffer(proof.artifacts.proofBytesBase64)
      });
      const sent = await tx.signAndSend();
      sent.result.unwrap();

      setChain((current) => ({
        ...current,
        status: "released",
        releaseTx: sent.sendTransactionResponse?.hash
      }));
      setNotice(`Proof verified on Stellar. Payment released to ${credential.freelancer}.`);
    } catch (caught) {
      setError(readError(caught));
      setNotice("Release failed.");
    } finally {
      setBusy(undefined);
    }
  }

  async function runRejectCase() {
    setBusy("reject");
    setRejectCase({ status: "idle" });

    try {
      const response = await fetch("/api/proof/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ persona: "unqualified" })
      });
      const payload = (await response.json()) as {
        eligibility?: { reason?: string };
        message?: string;
      };

      if (response.status === 422) {
        setRejectCase({
          status: "blocked",
          message:
            payload.eligibility?.reason ??
            "The credential was blocked before release."
        });
      } else {
        throw new Error(payload.message ?? "Unexpected reject-case response.");
      }
    } catch (caught) {
      setRejectCase({ status: "error", message: readError(caught) });
    } finally {
      setBusy(undefined);
    }
  }

  const primaryAction = getPrimaryAction({
    busy,
    chainStatus: chain.status,
    connectWallet,
    createInvoice,
    fundInvoice,
    invoiceError,
    proofReady,
    prepareProof,
    releasePayment,
    walletConnected,
    walletStatus: wallet.status
  });

  return (
    <main className="appShell">
      <header className="appHeader">
        <div className="brandLockup" aria-label="ProofPay">
          <span className="brandMark">
            <LockKeyhole size={18} />
          </span>
          <div>
            <strong>ProofPay</strong>
            <span>Private reputation checkout</span>
          </div>
        </div>
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

      <section className="checkoutHero" aria-label="ProofPay checkout">
        <div className="checkoutPanel">
          <div className="invoiceHeader">
            <div>
              <p className="eyebrow">Invoice {invoiceDraft.id}</p>
              <h1>{invoiceDraft.client || "Client"} pays {credential.freelancer}</h1>
            </div>
            <StatusBadge tone={chain.status === "released" ? "success" : "neutral"}>
              {chain.status === "released" ? "Released" : networkConfig.name}
            </StatusBadge>
          </div>

          <InvoiceEditor
            draft={invoiceDraft}
            error={invoiceError}
            locked={invoiceLocked}
            onChange={(nextDraft) => {
              setInvoiceDraft(nextDraft);
              if (error) setError(undefined);
            }}
          />

          <div className="amountRow">
            <span>{invoiceDraft.amountXlm || "0.0000000"}</span>
            <strong>XLM</strong>
          </div>

          <div className="partyGrid">
            <DataPoint label="Client" value={invoiceDraft.client || "Draft client"} />
            <DataPoint label="Project" value={invoiceDraft.project || "Draft milestone"} />
            <DataPoint label="Payee" value={`${credential.freelancer} ${credential.handle}`} />
            <DataPoint
              label="Minimum paid history"
              value={`$${(invoiceDraft.minTotalCents / 100).toLocaleString()}`}
            />
            <DataPoint
              label="Minimum paid invoices"
              value={invoiceDraft.minPaidCount.toString()}
            />
          </div>

          <StepList
            proofReady={proofReady}
            walletConnected={walletConnected}
            chain={chain}
          />

          <button
            className="primaryAction"
            type="button"
            onClick={primaryAction.action}
            disabled={!primaryAction.action || Boolean(busy)}
          >
            {primaryAction.busy ? (
              <Loader2 size={18} className="spin" />
            ) : (
              primaryAction.icon
            )}
            <span>{primaryAction.label}</span>
            {!primaryAction.busy && chain.status !== "released" ? (
              <ArrowRight size={17} />
            ) : null}
          </button>

          <div
            className={`notice ${error ? "noticeError" : "noticeInfo"}`}
            role="status"
            aria-live="polite"
          >
            {error ? <CircleAlert size={17} /> : <ShieldCheck size={17} />}
            <span>{error ?? notice}</span>
          </div>
        </div>

        <aside className="proofPanel" aria-label="Private proof summary">
          <div className="proofHeader">
            <BadgeCheck size={22} />
            <div>
              <p className="eyebrow">Private work proof</p>
              <h2>{proofReady ? "Approved for escrow" : "Waiting for proof"}</h2>
            </div>
          </div>

          <div className="proofMeter">
            <div>
              <span>Verified paid work</span>
              <strong>{proofReady ? "Threshold passed" : "Not checked"}</strong>
            </div>
            <CheckCircle2 size={24} className={proofReady ? "okIcon" : "mutedIcon"} />
          </div>

          <div className="metricRows">
            <DataPoint
              label="Aggregate requirement"
              value={`Met ${proofDelta.totalLabel}`}
            />
            <DataPoint
              label="Invoice count requirement"
              value={`Met ${proofDelta.countLabel}`}
            />
            <DataPoint
              label="Raw revenue disclosed"
              value="No"
            />
            <DataPoint
              label="Client names disclosed"
              value="No"
            />
          </div>

          <div className="linkList">
            <ProofLink
              label="Verifier contract"
              href={stellarExpertContractUrl(proofpayDeployment.verifierId)}
            />
            <ProofLink
              label="Proof verification tx"
              href={stellarExpertTxUrl(liveProof.verificationTx)}
            />
            <ProofLink
              label="Recorded escrow release"
              href={stellarExpertTxUrl(liveProof.escrowReleaseTx)}
            />
          </div>
        </aside>
      </section>

      <section className="privacyGrid" aria-label="Payment privacy">
        <InfoPanel
          icon={<ShieldCheck size={20} />}
          title="Client sees"
          items={[
            `${credential.freelancer} meets the agreed paid-work threshold`,
            "The proof matches this invoice",
            "The nullifier has not been used before"
          ]}
        />
        <InfoPanel
          icon={<LockKeyhole size={20} />}
          title={`${credential.freelancer} keeps private`}
          items={[
            "Exact historical revenue",
            "Past client names",
            "Full credential and invoice history"
          ]}
        />
        <InfoPanel
          icon={<Banknote size={20} />}
          title="Escrow protects"
          items={[
            "Funds stay locked until proof verification",
            "Release cannot run twice",
            "Expired invoices can be cancelled"
          ]}
        />
      </section>

      <details className="auditTrail">
        <summary>
          <span>Proof and contract details</span>
          <span>Audit trail</span>
        </summary>

        <div className="auditGrid">
          <div className="auditSection">
            <h3>On-chain state</h3>
            <KeyValue label="ProofPay contract" value={proofpayDeployment.contractId} />
            <KeyValue label="Verifier" value={proofpayDeployment.verifierId} />
            <KeyValue label="Registered root" value={proof?.publicInputs.root ?? proofpayDeployment.root} />
            <KeyValue label="Current client" value={invoiceDraft.client} />
            <KeyValue label="Current project" value={invoiceDraft.project} />
            <KeyValue label="Current amount" value={`${invoiceDraft.amountXlm || "0"} XLM`} />
            <KeyValue label="Recorded escrow invoice" value={liveProof.escrowInvoiceId} />
            <KeyValue label="Invoice ID" value={chain.invoiceId ?? "Created from wallet"} />
            <TxValue label="Create tx" value={chain.createTx} />
            <TxValue label="Fund tx" value={chain.fundTx} />
            <TxValue label="Release tx" value={chain.releaseTx} />
            <TxValue label="Recorded release" value={liveProof.escrowReleaseTx} />
          </div>

          <div className="auditSection">
            <h3>Public proof inputs</h3>
            {proofPublicInputOrder.map((item) => (
              <KeyValue
                key={item}
                label={item}
                value={shortHex(proof?.publicInputs[item])}
              />
            ))}
            <KeyValue
              label="Proof bytes"
              value={
                proof
                  ? `${proof.artifacts.proofByteLength.toLocaleString()} bytes`
                  : "Generated locally"
              }
            />
          </div>

          <div className="auditSection">
            <h3>Negative case</h3>
            <p>
              Kai&apos;s demo credential is below the same threshold and should be
              blocked before payment release.
            </p>
            <button
              className="secondaryAction"
              type="button"
              onClick={runRejectCase}
              disabled={Boolean(busy)}
            >
              {busy === "reject" ? <Loader2 size={16} className="spin" /> : <CircleAlert size={16} />}
              <span>Run reject case</span>
            </button>
            {rejectCase.message ? (
              <div
                className={`compactNotice ${
                  rejectCase.status === "blocked" ? "compactSuccess" : "compactError"
                }`}
              >
                {rejectCase.message}
              </div>
            ) : null}
          </div>
        </div>
      </details>
    </main>
  );
}

function StepList({
  proofReady,
  walletConnected,
  chain
}: {
  proofReady: boolean;
  walletConnected: boolean;
  chain: ChainState;
}) {
  const steps = [
    { label: "Private proof", complete: proofReady },
    { label: "Client wallet", complete: walletConnected },
    {
      label: "Escrow invoice",
      complete: ["created", "funded", "released"].includes(chain.status)
    },
    { label: "Funded", complete: ["funded", "released"].includes(chain.status) },
    { label: "Released", complete: chain.status === "released" }
  ];

  return (
    <ol className="stepList" aria-label="Checkout progress">
      {steps.map((step) => (
        <li className={step.complete ? "complete" : ""} key={step.label}>
          <span>{step.complete ? <CheckCircle2 size={15} /> : null}</span>
          <strong>{step.label}</strong>
        </li>
      ))}
    </ol>
  );
}

function InvoiceEditor({
  draft,
  error,
  locked,
  onChange
}: {
  draft: InvoiceDraft;
  error?: string;
  locked: boolean;
  onChange: (draft: InvoiceDraft) => void;
}) {
  function update<K extends keyof InvoiceDraft>(key: K, value: InvoiceDraft[K]) {
    onChange({ ...draft, [key]: value });
  }

  return (
    <form className="invoiceForm" onSubmit={(event) => event.preventDefault()}>
      <label className="field">
        <span>Client</span>
        <input
          type="text"
          value={draft.client}
          placeholder="Acme Studio"
          onChange={(event) => update("client", event.target.value)}
          disabled={locked}
          maxLength={64}
        />
      </label>
      <label className="field">
        <span>Project</span>
        <input
          type="text"
          value={draft.project}
          placeholder="Launch milestone"
          onChange={(event) => update("project", event.target.value)}
          disabled={locked}
          maxLength={84}
        />
      </label>
      <label className="field compactField">
        <span>Amount</span>
        <input
          type="text"
          inputMode="decimal"
          value={draft.amountXlm}
          placeholder="7.5000000"
          onChange={(event) => update("amountXlm", event.target.value)}
          disabled={locked}
          maxLength={18}
        />
      </label>
      <label className="field compactField">
        <span>Proof policy</span>
        <input
          type="text"
          value={formatProofPolicy(draft)}
          disabled
          readOnly
        />
      </label>
      <div className={`formHint ${error ? "formError" : ""}`}>
        {error
          ? error
          : locked
            ? "Invoice locked after escrow creation."
            : "Draft updates feed the checkout and escrow amount."}
      </div>
    </form>
  );
}

function getPrimaryAction({
  busy,
  chainStatus,
  connectWallet,
  createInvoice,
  fundInvoice,
  invoiceError,
  prepareProof,
  proofReady,
  releasePayment,
  walletConnected,
  walletStatus
}: {
  busy?: BusyAction;
  chainStatus: ChainState["status"];
  connectWallet: () => Promise<void>;
  createInvoice: () => Promise<void>;
  fundInvoice: () => Promise<void>;
  invoiceError?: string;
  prepareProof: () => Promise<void>;
  proofReady: boolean;
  releasePayment: () => Promise<void>;
  walletConnected: boolean;
  walletStatus: WalletState["status"];
}): {
  label: string;
  icon: ReactNode;
  action?: () => Promise<void>;
  busy: boolean;
} {
  if (chainStatus === "local" && invoiceError) {
    return {
      label: "Complete invoice details",
      icon: <FileCheck2 size={18} />,
      busy: false
    };
  }

  if (!proofReady) {
    return {
      label: "Check private proof",
      icon: <Fingerprint size={18} />,
      action: prepareProof,
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

  if (chainStatus === "local") {
    return {
      label: "Create escrow invoice",
      icon: <FileCheck2 size={18} />,
      action: createInvoice,
      busy: busy === "create"
    };
  }

  if (chainStatus === "created") {
    return {
      label: "Fund escrow",
      icon: <Banknote size={18} />,
      action: fundInvoice,
      busy: busy === "fund"
    };
  }

  if (chainStatus === "funded") {
    return {
      label: "Verify proof and release",
      icon: <ShieldCheck size={18} />,
      action: releasePayment,
      busy: busy === "release"
    };
  }

  return {
    label: "Payment released",
    icon: <CheckCircle2 size={18} />,
    busy: false
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

function InfoPanel({
  icon,
  title,
  items
}: {
  icon: ReactNode;
  title: string;
  items: string[];
}) {
  return (
    <div className="infoPanel">
      <div className="infoTitle">
        {icon}
        <h2>{title}</h2>
      </div>
      <ul>
        {items.map((item) => (
          <li key={item}>
            <CheckCircle2 size={15} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
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

function KeyValue({ label, value }: { label: string; value?: string }) {
  return (
    <div className="keyValue">
      <span>{label}</span>
      <code>{value ?? "pending"}</code>
    </div>
  );
}

function TxValue({ label, value }: { label: string; value?: string }) {
  return (
    <div className="keyValue">
      <span>{label}</span>
      {value ? (
        <a href={stellarExpertTxUrl(value)} target="_blank" rel="noreferrer">
          {shortHex(value)}
        </a>
      ) : (
        <code>pending</code>
      )}
    </div>
  );
}

function requiredInput(proof: ProofPayload, key: string): string {
  const value = proof.publicInputs[key];
  if (!value) throw new Error(`Missing proof public input: ${key}`);
  return value;
}

function validateInvoiceDraft(draft: InvoiceDraft): string | undefined {
  if (!draft.client.trim()) return "Add a client name.";
  if (!draft.project.trim()) return "Add a project or milestone.";
  if (!/^\d+(\.\d{1,7})?$/.test(draft.amountXlm.trim())) {
    return "Enter an XLM amount with up to 7 decimals.";
  }

  if (xlmToStroops(draft.amountXlm) <= 0n) {
    return "Invoice amount must be greater than zero.";
  }

  return undefined;
}

function formatProofPolicy(draft: InvoiceDraft): string {
  const dollars = draft.minTotalCents / 100;
  const total =
    dollars >= 1000 && dollars % 1000 === 0
      ? `$${dollars / 1000}k+`
      : `$${dollars.toLocaleString()}+`;

  return `${total} / ${draft.minPaidCount}+`;
}

function readError(caught: unknown): string {
  if (caught instanceof Error) return caught.message;
  return "Something went wrong. Try again.";
}
