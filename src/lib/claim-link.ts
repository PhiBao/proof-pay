import type { DemoCredential } from "@/lib/demo-data";

export type ClaimLinkPayload = {
  version: 1;
  invoiceId: string;
  contractId: string;
  client: string;
  project: string;
  payer: string;
  payee: string;
  token: string;
  amountXlm: string;
  amountStroops: string;
  minTotalCents: number;
  minPaidCount: number;
  periodBucket: number;
  expiresAt: number;
  root: string;
  payeeHash: string;
  invoiceHash: string;
  createTx?: string;
  fundTx?: string;
  credential: Pick<DemoCredential, "freelancer" | "handle" | "periodBucket">;
};

function toBase64Url(value: string): string {
  if (typeof window === "undefined") {
    return Buffer.from(value, "utf8").toString("base64url");
  }
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  if (typeof window === "undefined") {
    return Buffer.from(value, "base64url").toString("utf8");
  }
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeClaimPayload(payload: ClaimLinkPayload): string {
  return toBase64Url(JSON.stringify(payload));
}

export function decodeClaimPayload(encoded: string): ClaimLinkPayload {
  const payload = JSON.parse(fromBase64Url(encoded)) as ClaimLinkPayload;
  if (payload.version !== 1 || !payload.invoiceId || !payload.invoiceHash) {
    throw new Error("Invalid claim link.");
  }
  return payload;
}
