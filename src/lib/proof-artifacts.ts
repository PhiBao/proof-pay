import { readFile } from "node:fs/promises";
import path from "node:path";

const TARGET_DIR = path.join(process.cwd(), "circuits", "proofpay", "target");

export type ProofArtifacts = {
  proofBytesBase64: string;
  publicInputsBase64: string;
  proofBytesHex: string;
  publicInputsHex: string;
  proofByteLength: number;
  publicInputByteLength: number;
};

export async function loadProofArtifacts(): Promise<ProofArtifacts> {
  const [proofBytes, publicInputs] = await Promise.all([
    readFile(path.join(TARGET_DIR, "proof")),
    readFile(path.join(TARGET_DIR, "public_inputs"))
  ]);

  return {
    proofBytesBase64: proofBytes.toString("base64"),
    publicInputsBase64: publicInputs.toString("base64"),
    proofBytesHex: `0x${proofBytes.toString("hex")}`,
    publicInputsHex: `0x${publicInputs.toString("hex")}`,
    proofByteLength: proofBytes.byteLength,
    publicInputByteLength: publicInputs.byteLength
  };
}

