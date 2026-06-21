"use client";

import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  CircleAlert,
  Copy,
  ExternalLink,
  FileCheck2,
  Link2,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Wallet
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { proofpayDeployment } from "@/lib/app-config";
import { demoInvoice, networkConfig, shortHex } from "@/lib/demo-data";
import {
  encodeClaimPayload,
  type ClaimLinkPayload
} from "@/lib/claim-link";
import {
  connectFreighterWallet,
  freighterSigner,
  shortAddress,
  type WalletState
} from "@/lib/freighter-wallet";
import type { CanonicalInvoice } from "@/lib/invoice-proof";
import {
  fieldHexToBuffer,
  makeProofPayClient,
  xlmToStroops
} from "@/lib/proofpay-client";

type BusyAction = "wallet" | "commit" | "create" | "fund" | "copy";

type InvoiceDraft = {
  id: string;
  client: string;
  project: string;
  payeeAddress: string;
  amountXlm: string;
  minTotalCents: number;
  minPaidCount: number;
  periodBucket: number;
};

type CommitmentPayload = {
  status: "ready";
  credential: {
    freelancer: string;
    handle: string;
    periodBucket: number;
  };
  invoice: CanonicalInvoice;
  publicInputs: {
    root: string;
    payee_hash: string;
    invoice_hash: string;
    min_total_cents: string;
    min_paid_count: string;
    period_bucket: string;
  };
  contracts: typeof proofpayDeployment;
};

type ChainState = {
  status: "draft" | "committed" | "created" | "funded";
  invoiceId?: string;
  createTx?: string;
  fundTx?: string;
};

const initialWallet: WalletState = {
  status: "idle",
  message: "Connect Freighter to create and fund escrow."
};

const initialDraft: InvoiceDraft = {
  id: demoInvoice.id,
  client: "Aster Labs",
  project: "Landing page milestone",
  payeeAddress: demoInvoice.payeeAddress,
  amountXlm: demoInvoice.amountXlm,
  minTotalCents: demoInvoice.minTotalCents,
  minPaidCount: demoInvoice.minPaidCount,
  periodBucket: demoInvoice.periodBucket
};

export default function PayPage() {
  const [draft, setDraft] = useState<InvoiceDraft>(initialDraft);
  const [wallet, setWallet] = useState<WalletState>(initialWallet);
  const [commitment, setCommitment] = useState<CommitmentPayload>();
  const [chain, setChain] = useState<ChainState>({ status: "draft" });
  const [busy, setBusy] = useState<BusyAction>();
  const [notice, setNotice] = useState(
    "Review the invoice, lock escrow, then share a private claim link with the contractor."
  );
  const [error, setError] = useState<string>();

  const invoiceLocked = chain.status !== "draft" && chain.status !== "committed";
  const invoiceError = validateInvoiceDraft(draft);
  const walletConnected = wallet.status === "connected";
  const claimUrl = useMemo(() => {
    if (typeof window === "undefined" || !commitment || !chain.invoiceId) return "";
    const payload: ClaimLinkPayload = {
      version: 1,
      invoiceId: chain.invoiceId,
      contractId: proofpayDeployment.contractId,
      client: draft.client.trim(),
      project: draft.project.trim(),
      payer: commitment.invoice.payer,
      payee: commitment.invoice.payee,
      token: commitment.invoice.token,
      amountXlm: draft.amountXlm.trim(),
      amountStroops: commitment.invoice.amountStroops,
      minTotalCents: commitment.invoice.minTotalCents,
      minPaidCount: commitment.invoice.minPaidCount,
      periodBucket: commitment.invoice.periodBucket,
      expiresAt: commitment.invoice.expiresAt,
      root: commitment.publicInputs.root,
      payeeHash: commitment.publicInputs.payee_hash,
      invoiceHash: commitment.publicInputs.invoice_hash,
      createTx: chain.createTx,
      fundTx: chain.fundTx,
      credential: commitment.credential
    };
    return `${window.location.origin}/claim/${chain.invoiceId}?p=${encodeClaimPayload(payload)}`;
  }, [chain.createTx, chain.fundTx, chain.invoiceId, commitment, draft]);

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

  async function prepareCommitment() {
    if (wallet.status !== "connected") {
      setError("Connect Freighter before committing an invoice.");
      return undefined;
    }
    const validationError = validateInvoiceDraft(draft);
    if (validationError) {
      setError(validationError);
      return undefined;
    }

    setBusy("commit");
    setError(undefined);
    setNotice("Computing the invoice commitment for escrow creation.");

    try {
      const response = await fetch("/api/invoice/commitment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client: draft.client,
          project: draft.project,
          payer: wallet.address,
          payee: draft.payeeAddress,
          token: proofpayDeployment.nativeTokenContractId,
          amountXlm: draft.amountXlm,
          minTotalCents: draft.minTotalCents,
          minPaidCount: draft.minPaidCount,
          periodBucket: draft.periodBucket,
          expiresAt: proofpayDeployment.rootExpiresAt
        })
      });
      const payload = (await response.json()) as CommitmentPayload & {
        message?: string;
      };
      if (!response.ok || payload.status !== "ready") {
        throw new Error(payload.message ?? "Invoice commitment failed.");
      }
      setCommitment(payload);
      setChain((current) => ({ ...current, status: "committed" }));
      setNotice("Invoice commitment ready. Create the escrow invoice next.");
      return payload;
    } catch (caught) {
      setError(readError(caught));
      setNotice("Invoice commitment failed.");
      return undefined;
    } finally {
      setBusy(undefined);
    }
  }

  async function createInvoice() {
    if (wallet.status !== "connected") return;
    const activeCommitment = commitment ?? (await prepareCommitment());
    if (!activeCommitment) return;

    setBusy("create");
    setError(undefined);
    setNotice("Asking Freighter to create the proof-gated escrow invoice.");

    try {
      const client = makeProofPayClient(
        wallet.address,
        freighterSigner(wallet.address)
      );
      const tx = await client.create_invoice({
        payer: wallet.address,
        payee: activeCommitment.invoice.payee,
        token: proofpayDeployment.nativeTokenContractId,
        amount: xlmToStroops(draft.amountXlm),
        root: fieldHexToBuffer(activeCommitment.publicInputs.root),
        payee_hash: fieldHexToBuffer(activeCommitment.publicInputs.payee_hash),
        invoice_hash: fieldHexToBuffer(activeCommitment.publicInputs.invoice_hash),
        min_total_cents: BigInt(draft.minTotalCents),
        min_paid_count: draft.minPaidCount,
        period_bucket: draft.periodBucket,
        expires_at: BigInt(proofpayDeployment.rootExpiresAt)
      });
      const sent = await tx.signAndSend();
      const invoiceId = sent.result.unwrap().toString();

      setChain({
        status: "created",
        invoiceId,
        createTx: sent.sendTransactionResponse?.hash
      });
      setNotice(`Escrow invoice #${invoiceId} created. Fund it before sharing.`);
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
    setNotice("Asking Freighter to fund escrow.");

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
      setNotice("Escrow funded. Share the claim link with the contractor.");
    } catch (caught) {
      setError(readError(caught));
      setNotice("Escrow funding failed.");
    } finally {
      setBusy(undefined);
    }
  }

  async function copyClaimLink() {
    if (!claimUrl) return;
    setBusy("copy");
    try {
      await navigator.clipboard.writeText(claimUrl);
      setNotice("Claim link copied.");
    } catch (caught) {
      setError(readError(caught));
    } finally {
      setBusy(undefined);
    }
  }

  const primaryAction = getPayerAction({
    busy,
    chainStatus: chain.status,
    connectWallet,
    createInvoice,
    fundInvoice,
    invoiceError,
    prepareCommitment,
    walletConnected,
    walletStatus: wallet.status
  });

  return (
    <main className="appShell">
      <AppHeader
        wallet={wallet}
        busy={busy === "wallet"}
        onConnect={connectWallet}
      />

      <section className="flowHero" aria-label="ProofPay payer checkout">
        <div className="flowPanel">
          <div className="flowHeader">
            <div>
              <p className="eyebrow">Payer workspace</p>
              <h1>Lock a proof-gated escrow</h1>
            </div>
            <StatusBadge tone={chain.status === "funded" ? "success" : "neutral"}>
              {chain.status === "funded" ? "Ready to claim" : networkConfig.name}
            </StatusBadge>
          </div>

          <InvoiceEditor
            draft={draft}
            error={invoiceError}
            locked={invoiceLocked}
            onChange={(nextDraft) => {
              setDraft(nextDraft);
              setCommitment(undefined);
              setChain({ status: "draft" });
              if (error) setError(undefined);
              setNotice("Draft changed. Commit it again before escrow creation.");
            }}
          />

          <div className="amountRow compactAmount">
            <span>{draft.amountXlm || "0.0000000"}</span>
            <strong>XLM</strong>
          </div>

          <StepList
            steps={[
              { label: "Draft", complete: !invoiceError },
              { label: "Committed", complete: Boolean(commitment) },
              { label: "Created", complete: ["created", "funded"].includes(chain.status) },
              { label: "Funded", complete: chain.status === "funded" }
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
            {!primaryAction.busy && chain.status !== "funded" ? <ArrowRight size={17} /> : null}
          </button>

          <Notice error={error} message={notice} />
        </div>

        <aside className="claimPanel" aria-label="Claim link">
          <div className="proofHeader">
            <Link2 size={22} />
            <div>
              <p className="eyebrow">Funded claim link</p>
              <h2>{chain.status === "funded" ? "Share with contractor" : "Created after funding"}</h2>
            </div>
          </div>

          <div className="claimPreview">
            <DataPoint label="Contractor" value={commitment?.credential.freelancer ?? "Verified contractor"} />
            <DataPoint label="Invoice commitment" value={shortHex(commitment?.publicInputs.invoice_hash)} />
            <DataPoint label="Escrow invoice" value={chain.invoiceId ? `#${chain.invoiceId}` : "pending"} />
            <DataPoint label="Fund tx" value={shortHex(chain.fundTx)} />
          </div>

          <div className="linkBox">
            <code>{claimUrl || "Claim link appears after the escrow is funded."}</code>
          </div>

          <div className="buttonRow">
            <button
              className="secondaryAction"
              type="button"
              onClick={copyClaimLink}
              disabled={!claimUrl || Boolean(busy)}
            >
              {busy === "copy" ? <Loader2 size={16} className="spin" /> : <Copy size={16} />}
              <span>Copy link</span>
            </button>
            <a
              className={`secondaryLink ${claimUrl ? "" : "disabledLink"}`}
              href={claimUrl || undefined}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={16} />
              <span>Open claim</span>
            </a>
          </div>
        </aside>
      </section>

      <section className="privacyGrid" aria-label="Payment privacy">
        <InfoPanel
          icon={<Banknote size={20} />}
          title="Payer locks"
          items={[
            "Invoice amount in Stellar escrow",
            "Minimum paid-work policy",
            "Claim link for the contractor"
          ]}
        />
        <InfoPanel
          icon={<ShieldCheck size={20} />}
          title="Contractor proves"
          items={[
            "Credential clears the policy",
            "Proof matches this invoice",
            "Revenue and client history stay private"
          ]}
        />
        <InfoPanel
          icon={<LockKeyhole size={20} />}
          title="Contract enforces"
          items={[
            "Trusted issuer root",
            "Funded invoice before release",
            "Nullifier cannot release twice"
          ]}
        />
      </section>
    </main>
  );
}

function AppHeader({
  wallet,
  busy,
  onConnect
}: {
  wallet: WalletState;
  busy: boolean;
  onConnect: () => Promise<void>;
}) {
  return (
    <header className="appHeader">
      <div className="brandLockup" aria-label="ProofPay">
        <span className="brandMark">
          <LockKeyhole size={18} />
        </span>
        <div>
          <strong>ProofPay</strong>
          <span>Private contractor trust checkout</span>
        </div>
      </div>
      <button
        className="walletButton"
        type="button"
        onClick={onConnect}
        disabled={busy}
      >
        {busy ? <Loader2 size={17} className="spin" /> : <Wallet size={17} />}
        <span>
          {wallet.status === "connected"
            ? shortAddress(wallet.address)
            : "Connect wallet"}
        </span>
      </button>
    </header>
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
    <form
      className="invoiceForm"
      autoComplete="off"
      onSubmit={(event) => event.preventDefault()}
    >
      <label className="field">
        <span>Client</span>
        <input
          type="text"
          name="proofpay-client"
          value={draft.client}
          placeholder="Aster Labs"
          onChange={(event) => update("client", event.target.value)}
          disabled={locked}
          maxLength={64}
        />
      </label>
      <label className="field">
        <span>Project</span>
        <input
          type="text"
          name="proofpay-project"
          value={draft.project}
          placeholder="Landing page milestone"
          onChange={(event) => update("project", event.target.value)}
          disabled={locked}
          maxLength={84}
        />
      </label>
      <label className="field compactField">
        <span>Amount</span>
        <input
          type="text"
          name="proofpay-amount"
          inputMode="decimal"
          value={draft.amountXlm}
          placeholder="7.5000000"
          onChange={(event) => update("amountXlm", event.target.value)}
          disabled={locked}
          maxLength={18}
        />
      </label>
      <label className="field compactField">
        <span>Min history</span>
        <input
          type="text"
          name="proofpay-min-history"
          inputMode="numeric"
          value={String(Math.floor(draft.minTotalCents / 100))}
          onChange={(event) => {
            const dollars = Number(event.target.value.replace(/[^\d]/g, ""));
            update("minTotalCents", Number.isFinite(dollars) ? dollars * 100 : 0);
          }}
          disabled={locked}
          maxLength={9}
        />
      </label>
      <label className="field compactField">
        <span>Min invoices</span>
        <input
          type="text"
          name="proofpay-min-invoices"
          inputMode="numeric"
          value={String(draft.minPaidCount)}
          onChange={(event) => {
            const count = Number(event.target.value.replace(/[^\d]/g, ""));
            update("minPaidCount", Number.isFinite(count) ? count : 0);
          }}
          disabled={locked}
          maxLength={4}
        />
      </label>
      <div className={`formHint ${error ? "formError" : ""}`}>
        {error
          ? error
          : locked
            ? "Invoice terms are locked after escrow creation."
            : "The claim link will carry these exact invoice terms."}
      </div>
    </form>
  );
}

function StepList({
  steps
}: {
  steps: Array<{ label: string; complete: boolean }>;
}) {
  return (
    <ol className="stepList fourSteps" aria-label="Payer progress">
      {steps.map((step) => (
        <li className={step.complete ? "complete" : ""} key={step.label}>
          <span>{step.complete ? <CheckCircle2 size={15} /> : null}</span>
          <strong>{step.label}</strong>
        </li>
      ))}
    </ol>
  );
}

function getPayerAction({
  busy,
  chainStatus,
  connectWallet,
  createInvoice,
  fundInvoice,
  invoiceError,
  prepareCommitment,
  walletConnected,
  walletStatus
}: {
  busy?: BusyAction;
  chainStatus: ChainState["status"];
  connectWallet: () => Promise<void>;
  createInvoice: () => Promise<void>;
  fundInvoice: () => Promise<void>;
  invoiceError?: string;
  prepareCommitment: () => Promise<CommitmentPayload | undefined>;
  walletConnected: boolean;
  walletStatus: WalletState["status"];
}): {
  label: string;
  icon: ReactNode;
  action?: () => Promise<unknown>;
  busy: boolean;
} {
  if (invoiceError) {
    return {
      label: "Complete invoice details",
      icon: <FileCheck2 size={18} />,
      busy: false
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

  if (chainStatus === "draft") {
    return {
      label: "Commit invoice terms",
      icon: <ShieldCheck size={18} />,
      action: prepareCommitment,
      busy: busy === "commit"
    };
  }

  if (chainStatus === "committed") {
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

  return {
    label: "Escrow funded",
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

function validateInvoiceDraft(draft: InvoiceDraft): string | undefined {
  if (!draft.client.trim()) return "Add a client name.";
  if (!draft.project.trim()) return "Add a project or milestone.";
  if (!/^\d+(\.\d{1,7})?$/.test(draft.amountXlm.trim())) {
    return "Enter an XLM amount with up to 7 decimals.";
  }
  if (xlmToStroops(draft.amountXlm) <= 0n) {
    return "Invoice amount must be greater than zero.";
  }
  if (!Number.isInteger(draft.minTotalCents) || draft.minTotalCents <= 0) {
    return "Minimum paid history must be greater than zero.";
  }
  if (!Number.isInteger(draft.minPaidCount) || draft.minPaidCount <= 0) {
    return "Minimum paid invoice count must be greater than zero.";
  }
  return undefined;
}

function readError(caught: unknown): string {
  if (caught instanceof Error) return caught.message;
  return "Something went wrong. Try again.";
}
