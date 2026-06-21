import { createHash } from "node:crypto";
import { demoInvoice } from "@/lib/demo-data";

export type InvoiceProofRequest = {
  persona?: "qualified" | "unqualified";
  client?: string;
  project?: string;
  payer?: string;
  payee?: string;
  token?: string;
  amountXlm?: string;
  minTotalCents?: number;
  minPaidCount?: number;
  periodBucket?: number;
  expiresAt?: number;
  invoiceHash?: string;
};

export type CanonicalInvoice = {
  client: string;
  project: string;
  payer: string;
  payee: string;
  token: string;
  amountStroops: string;
  minTotalCents: number;
  minPaidCount: number;
  periodBucket: number;
  expiresAt: number;
};

export function parseXlmToStroops(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,7})?$/.test(trimmed)) {
    throw new Error("Amount must be a positive XLM value with up to 7 decimals.");
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const stroops = `${whole}${fraction.padEnd(7, "0")}`;
  const parsed = BigInt(stroops);
  if (parsed <= 0n) {
    throw new Error("Amount must be greater than zero.");
  }
  return parsed;
}

export function canonicalizeInvoice(
  input: InvoiceProofRequest,
  defaults: {
    payer: string;
    payee: string;
    token: string;
    expiresAt: number;
  }
): CanonicalInvoice {
  const client = input.client?.trim() ?? "";
  const project = input.project?.trim() ?? "";
  const amountXlm = input.amountXlm?.trim() || demoInvoice.amountXlm;
  if (!client || !project) {
    throw new Error("Client and project are required before generating a proof.");
  }

  const minTotalCents = Number(input.minTotalCents ?? demoInvoice.minTotalCents);
  const minPaidCount = Number(input.minPaidCount ?? demoInvoice.minPaidCount);
  const periodBucket = Number(input.periodBucket ?? demoInvoice.periodBucket);
  if (!Number.isInteger(minTotalCents) || minTotalCents <= 0) {
    throw new Error("Minimum paid history must be a positive integer.");
  }
  if (!Number.isInteger(minPaidCount) || minPaidCount <= 0) {
    throw new Error("Minimum paid invoice count must be a positive integer.");
  }
  if (!Number.isInteger(periodBucket) || periodBucket <= 0) {
    throw new Error("Period bucket must be a positive integer.");
  }

  return {
    client,
    project,
    payer: input.payer?.trim() || defaults.payer,
    payee: input.payee?.trim() || defaults.payee,
    token: input.token?.trim() || defaults.token,
    amountStroops: parseXlmToStroops(amountXlm).toString(),
    minTotalCents,
    minPaidCount,
    periodBucket,
    expiresAt: Number(input.expiresAt ?? defaults.expiresAt)
  };
}

export function invoiceHashField(invoice: CanonicalInvoice): string {
  const canonical = JSON.stringify({
    amountStroops: invoice.amountStroops,
    client: invoice.client,
    expiresAt: invoice.expiresAt,
    minPaidCount: invoice.minPaidCount,
    minTotalCents: invoice.minTotalCents,
    payee: invoice.payee,
    payer: invoice.payer,
    periodBucket: invoice.periodBucket,
    project: invoice.project,
    token: invoice.token
  });
  const digest = createHash("sha256")
    .update("ProofPay invoice v1:")
    .update(canonical)
    .digest();
  digest[0] = digest[0] & 0x1f;
  return `0x${digest.toString("hex")}`;
}

export function normalizeFieldHex(value: string): string {
  const normalized = value.startsWith("0x") ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]{1,64}$/.test(normalized)) {
    throw new Error("Invalid field hex value.");
  }
  return `0x${normalized.toLowerCase().padStart(64, "0")}`;
}
