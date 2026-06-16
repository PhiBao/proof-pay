import { NextResponse } from "next/server";
import {
  demoCredentials,
  loadCircuitProfile,
  type ProofpayPersona
} from "@/lib/proofpay";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    persona?: ProofpayPersona;
  };
  const persona = body.persona === "unqualified" ? "unqualified" : "qualified";
  const credential = demoCredentials[persona];
  const circuit = await loadCircuitProfile(persona).catch(() => undefined);

  return NextResponse.json({
    credential: {
      ...credential,
      root: circuit?.root,
      nullifier: circuit?.nullifier
    },
    issuer: "ProofPay Demo Issuer",
    expiresAt: "2026-06-29T23:59:59Z"
  });
}

