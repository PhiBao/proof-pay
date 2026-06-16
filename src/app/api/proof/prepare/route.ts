import { NextResponse } from "next/server";
import {
  demoCredentials,
  demoInvoice,
  loadCircuitProfile,
  proofPublicInputOrder,
  type ProofpayPersona
} from "@/lib/proofpay";
import { liveProof, proofpayDeployment } from "@/lib/app-config";
import { loadProofArtifacts } from "@/lib/proof-artifacts";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    persona?: ProofpayPersona;
  };
  const persona = body.persona === "unqualified" ? "unqualified" : "qualified";
  const credential = demoCredentials[persona];
  const totalGapCents =
    credential.aggregateTotalCents - demoInvoice.minTotalCents;
  const countGap = credential.paidInvoiceCount - demoInvoice.minPaidCount;
  const qualified = totalGapCents >= 0 && countGap >= 0;
  const circuit = await loadCircuitProfile(persona);

  if (!qualified) {
    return NextResponse.json(
      {
        persona,
        proofStatus: "blocked",
        credential,
        invoice: demoInvoice,
        eligibility: {
          qualified,
          totalGapCents,
          countGap,
          reason:
            "This credential does not meet the private work-history threshold."
        },
        publicInputOrder: proofPublicInputOrder,
        publicInputs: {
          root: circuit.root,
          payee_hash: circuit.payeeHash,
          invoice_hash: circuit.invoiceHash,
          min_total_cents: circuit.minTotalCents,
          min_paid_count: circuit.minPaidCount,
          period_bucket: circuit.periodBucket,
          nullifier: circuit.nullifier
        }
      },
      { status: 422 }
    );
  }

  const artifacts = await loadProofArtifacts().catch((error: Error) => error);
  if (artifacts instanceof Error) {
    return NextResponse.json(
      {
        persona,
        proofStatus: "missing-artifacts",
        message: "Proof artifacts are missing. Run `just build-circuit`.",
        error: artifacts.message
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    persona,
    proofStatus: "ready",
    credential,
    invoice: demoInvoice,
    eligibility: {
      qualified,
      totalGapCents,
      countGap
    },
    publicInputOrder: proofPublicInputOrder,
    publicInputs: {
      root: circuit.root,
      payee_hash: circuit.payeeHash,
      invoice_hash: circuit.invoiceHash,
      min_total_cents: circuit.minTotalCents,
      min_paid_count: circuit.minPaidCount,
      period_bucket: circuit.periodBucket,
      nullifier: circuit.nullifier
    },
    artifacts,
    contracts: proofpayDeployment,
    liveProof
  });
}
