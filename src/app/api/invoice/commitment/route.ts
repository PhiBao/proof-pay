import { NextResponse } from "next/server";
import { proofpayDeployment } from "@/lib/app-config";
import { demoCredentials, loadCircuitProfile } from "@/lib/proofpay";
import {
  canonicalizeInvoice,
  invoiceHashField,
  type InvoiceProofRequest
} from "@/lib/invoice-proof";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as InvoiceProofRequest;
  const credential = demoCredentials.qualified;
  const invoiceResult = (() => {
    try {
      return canonicalizeInvoice(body, {
        payer: body.payer ?? "",
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
        status: "invalid-invoice",
        message: invoiceResult.message
      },
      { status: 400 }
    );
  }

  const invoice = invoiceResult;
  const circuit = await loadCircuitProfile("qualified");
  const invoiceHash = invoiceHashField(invoice);

  return NextResponse.json({
    status: "ready",
    credential: {
      freelancer: credential.freelancer,
      handle: credential.handle,
      periodBucket: credential.periodBucket
    },
    invoice,
    publicInputs: {
      root: circuit.root,
      payee_hash: circuit.payeeHash,
      invoice_hash: invoiceHash,
      min_total_cents: `0x${BigInt(invoice.minTotalCents).toString(16).padStart(64, "0")}`,
      min_paid_count: `0x${BigInt(invoice.minPaidCount).toString(16).padStart(64, "0")}`,
      period_bucket: `0x${BigInt(invoice.periodBucket).toString(16).padStart(64, "0")}`
    },
    contracts: proofpayDeployment
  });
}
