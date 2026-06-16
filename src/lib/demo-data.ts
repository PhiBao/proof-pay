export type ProofpayPersona = "qualified" | "unqualified";

export type DemoCredential = {
  persona: ProofpayPersona;
  freelancer: string;
  handle: string;
  stellarAddress: string;
  aggregateTotalCents: number;
  paidInvoiceCount: number;
  periodBucket: number;
  payeeHash: string;
  root?: string;
  nullifier?: string;
};

export type DemoInvoice = {
  id: string;
  client: string;
  project: string;
  payee: string;
  payeeAddress: string;
  amountXlm: string;
  minTotalCents: number;
  minPaidCount: number;
  periodBucket: number;
  invoiceHash: string;
  status: "draft" | "funded" | "proof-ready" | "released";
};

export const networkConfig = {
  name: "Stellar testnet",
  passphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
  explorerBase: "https://stellar.expert/explorer/testnet/contract"
};

export const demoCredentials: Record<ProofpayPersona, DemoCredential> = {
  qualified: {
    persona: "qualified",
    freelancer: "Mira Chen",
    handle: "@mira-studio",
    stellarAddress: "GC3RZTRNYCX26UCL7R2DOQTSFV4TV5FUVFHRMXYND3NAKPKVPT36HMYM",
    aggregateTotalCents: 1845000,
    paidInvoiceCount: 27,
    periodBucket: 202606,
    payeeHash:
      "0x00000000000000000000000000000000000000000000000000000000a11ce001"
  },
  unqualified: {
    persona: "unqualified",
    freelancer: "Kai Novak",
    handle: "@kai-builds",
    stellarAddress: "GC3RZTRNYCX26UCL7R2DOQTSFV4TV5FUVFHRMXYND3NAKPKVPT36HMYM",
    aggregateTotalCents: 420000,
    paidInvoiceCount: 5,
    periodBucket: 202606,
    payeeHash:
      "0x00000000000000000000000000000000000000000000000000000000badc0de"
  }
};

export const demoInvoice: DemoInvoice = {
  id: "PP-2026-0616-001",
  client: "",
  project: "",
  payee: "Mira Chen",
  payeeAddress: demoCredentials.qualified.stellarAddress,
  amountXlm: "7.5000000",
  minTotalCents: 1200000,
  minPaidCount: 12,
  periodBucket: 202606,
  invoiceHash:
    "0x000000000000000000000000000000000000000000000000000000001ce2026",
  status: "proof-ready"
};

export const proofPublicInputOrder = [
  "root",
  "payee_hash",
  "invoice_hash",
  "min_total_cents",
  "min_paid_count",
  "period_bucket",
  "nullifier"
] as const;

export function toFieldHex(value: string | number | bigint): string {
  const source =
    typeof value === "string" && value.startsWith("0x")
      ? BigInt(value)
      : BigInt(value);
  return `0x${source.toString(16).padStart(64, "0")}`;
}

export function shortHex(value?: string): string {
  if (!value) return "pending";
  const normalized = value.startsWith("0x") ? value.slice(2) : value;
  return `0x${normalized.slice(0, 8)}...${normalized.slice(-6)}`;
}
