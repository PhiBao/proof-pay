import { readFile } from "node:fs/promises";
import path from "node:path";
import { toFieldHex, type ProofpayPersona } from "@/lib/demo-data";

export * from "@/lib/demo-data";

export async function loadCircuitProfile(persona: ProofpayPersona) {
  const file = path.join(
    process.cwd(),
    "circuits",
    "proofpay",
    `Prover.${persona}.toml`
  );
  const content = await readFile(file, "utf8");
  const pickRaw = (name: string) => {
    const match = content.match(new RegExp(`^${name}\\s*=\\s*\"([^\"]+)\"`, "m"));
    return match?.[1];
  };
  const pickField = (name: string) => {
    const value = pickRaw(name);
    return value ? toFieldHex(value) : undefined;
  };

  return {
    persona,
    root: pickField("root"),
    nullifier: pickField("nullifier"),
    payeeHash: pickField("payee_hash"),
    invoiceHash: pickField("invoice_hash"),
    minTotalCents: pickField("min_total_cents"),
    minPaidCount: pickField("min_paid_count"),
    periodBucket: pickField("period_bucket"),
    proverToml: content
  };
}

