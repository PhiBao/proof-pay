import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { copyFile, rm } from "node:fs/promises";
import { promisify } from "node:util";
import {
  demoCredentials,
  loadCircuitProfileFile,
  proofPublicInputOrder
} from "@/lib/proofpay";
import { liveProof, proofpayDeployment } from "@/lib/app-config";
import { loadProofArtifacts } from "@/lib/proof-artifacts";
import {
  canonicalizeInvoice,
  invoiceHashField,
  normalizeFieldHex,
  type InvoiceProofRequest
} from "@/lib/invoice-proof";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const runtimeProverName = "runtime";

function expectedPublicInputsHex(publicInputs: {
  root?: string;
  payeeHash?: string;
  invoiceHash?: string;
  minTotalCents?: string;
  minPaidCount?: string;
  periodBucket?: string;
  nullifier?: string;
}) {
  const ordered = [
    publicInputs.root,
    publicInputs.payeeHash,
    publicInputs.invoiceHash,
    publicInputs.minTotalCents,
    publicInputs.minPaidCount,
    publicInputs.periodBucket,
    publicInputs.nullifier
  ];
  if (ordered.some((value) => !value)) {
    throw new Error("Generated proof is missing public inputs.");
  }
  return `0x${ordered
    .map((value) => normalizeFieldHex(value ?? "").slice(2))
    .join("")}`;
}

async function runProofCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: Record<string, string> } = {}
) {
  await execFileAsync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, ...options.env },
    maxBuffer: 1024 * 1024 * 8
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as InvoiceProofRequest;
  const persona = body.persona === "unqualified" ? "unqualified" : "qualified";
  const credential = demoCredentials[persona];
  const invoiceResult = (() => {
    try {
      return canonicalizeInvoice(body, {
        payer: body.payer ?? "client-wallet-pending",
        payee: credential.stellarAddress,
        token: proofpayDeployment.nativeTokenContractId,
        expiresAt: proofpayDeployment.rootExpiresAt
      });
    } catch (error) {
      return error instanceof Error ? error : new Error("Invalid invoice payload.");
    }
  })();
  if (invoiceResult instanceof Error) {
    return NextResponse.json(
      {
        persona,
        proofStatus: "invalid-invoice",
        message: invoiceResult.message
      },
      { status: 400 }
    );
  }
  const invoice = invoiceResult;
  const totalGapCents =
    credential.aggregateTotalCents - invoice.minTotalCents;
  const countGap = credential.paidInvoiceCount - invoice.minPaidCount;
  const qualified = totalGapCents >= 0 && countGap >= 0;
  const invoiceHash = body.invoiceHash
    ? normalizeFieldHex(body.invoiceHash)
    : invoiceHashField(invoice);

  if (!qualified) {
    return NextResponse.json(
      {
        persona,
        proofStatus: "blocked",
        credential,
        invoice,
        eligibility: {
          qualified,
          totalGapCents,
          countGap,
          reason:
            "This credential does not meet the private work-history threshold."
        },
        publicInputOrder: proofPublicInputOrder,
        publicInputs: { invoice_hash: invoiceHash }
      },
      { status: 422 }
    );
  }

  const proofResult = await (async () => {
    const circuitDir = `${process.cwd()}/circuits/proofpay`;
    const runtimeProverPath = `${circuitDir}/Prover.${runtimeProverName}.toml`;
    const activeProverPath = `${circuitDir}/Prover.toml`;
    await runProofCommand(
      "cargo",
      [
        "run",
        "--quiet",
        "--example",
        "populate_publics",
        "--manifest-path",
        "contracts/proofpay/Cargo.toml",
        "--features",
        "std"
      ],
      {
        env: {
          PROOFPAY_PERSONA: persona,
          PROOFPAY_PROVER_OUTPUT: `circuits/proofpay/Prover.${runtimeProverName}.toml`,
          PROOFPAY_INVOICE_HASH: invoiceHash,
          PROOFPAY_MIN_TOTAL_CENTS: String(invoice.minTotalCents),
          PROOFPAY_MIN_PAID_COUNT: String(invoice.minPaidCount),
          PROOFPAY_PERIOD_BUCKET: String(invoice.periodBucket)
        }
      }
    );
    await copyFile(runtimeProverPath, activeProverPath);
    await rm(`${circuitDir}/target/proof`, { force: true });
    await rm(`${circuitDir}/target/public_inputs`, { force: true });
    await rm(`${circuitDir}/target/proofpay-${runtimeProverName}.gz`, { force: true });
    await runProofCommand("nargo", ["compile"], { cwd: circuitDir });
    await runProofCommand("nargo", ["execute", `proofpay-${runtimeProverName}`], {
      cwd: circuitDir
    });
    await runProofCommand(
      "bb",
      [
        "prove",
        "--scheme",
        "ultra_honk",
        "--oracle_hash",
        "keccak",
        "--bytecode_path",
        "target/proofpay.json",
        "--witness_path",
        "target/proofpay-runtime.gz",
        "--output_path",
        "target",
        "--output_format",
        "bytes_and_fields"
      ],
      { cwd: circuitDir }
    );

    const [circuit, artifacts] = await Promise.all([
      loadCircuitProfileFile(runtimeProverName),
      loadProofArtifacts()
    ]);
    const expectedHex = expectedPublicInputsHex(circuit);
    if (artifacts.publicInputsHex.toLowerCase() !== expectedHex.toLowerCase()) {
      throw new Error(
        "Generated proof artifact public inputs do not match the invoice commitment."
      );
    }
    return { circuit, artifacts };
  })().catch((error: Error) => error);

  if (proofResult instanceof Error) {
    return NextResponse.json(
      {
        persona,
        proofStatus: "missing-artifacts",
        message:
          "Proof generation failed. Confirm nargo, bb, and cargo are installed.",
        error: proofResult.message
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    persona,
    proofStatus: "ready",
    credential,
    invoice,
    eligibility: {
      qualified,
      totalGapCents,
      countGap
    },
    publicInputOrder: proofPublicInputOrder,
    publicInputs: {
      root: proofResult.circuit.root,
      payee_hash: proofResult.circuit.payeeHash,
      invoice_hash: proofResult.circuit.invoiceHash,
      min_total_cents: proofResult.circuit.minTotalCents,
      min_paid_count: proofResult.circuit.minPaidCount,
      period_bucket: proofResult.circuit.periodBucket,
      nullifier: proofResult.circuit.nullifier
    },
    artifacts: proofResult.artifacts,
    contracts: proofpayDeployment,
    liveProof
  });
}
