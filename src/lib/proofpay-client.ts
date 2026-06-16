import { Buffer } from "buffer";
import type { SignTransaction } from "@stellar/stellar-sdk/contract";
import { Client as ProofPayClient } from "@/contracts/proofpay/src";
import { proofpayDeployment } from "@/lib/app-config";
import { networkConfig } from "@/lib/demo-data";

export function makeProofPayClient(
  publicKey: string,
  signTransaction?: SignTransaction
): ProofPayClient {
  return new ProofPayClient({
    contractId: proofpayDeployment.contractId,
    networkPassphrase: networkConfig.passphrase,
    publicKey,
    rpcUrl: networkConfig.rpcUrl,
    signTransaction
  });
}

export function fieldHexToBuffer(hex: string): Buffer {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Buffer.from(normalized.padStart(64, "0"), "hex");
}

export function base64ToBuffer(value: string): Buffer {
  return Buffer.from(value, "base64");
}

export function xlmToStroops(amount: string): bigint {
  const [whole, fraction = ""] = amount.split(".");
  const fractionPadded = `${fraction}0000000`.slice(0, 7);
  return BigInt(whole) * 10_000_000n + BigInt(fractionPadded);
}

