import { NextResponse } from "next/server";
import { proofpayDeployment } from "@/lib/app-config";
import { demoInvoice, networkConfig } from "@/lib/proofpay";

export async function POST() {
  return NextResponse.json({
    invoice: demoInvoice,
    network: networkConfig,
    contracts: proofpayDeployment
  });
}
