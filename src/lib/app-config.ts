import { networkConfig } from "@/lib/demo-data";

export const proofpayDeployment = {
  contractId:
    process.env.NEXT_PUBLIC_PROOFPAY_CONTRACT_ID ??
    "CDMJGLNX4DL4ZUUMR6LOWKL6SAOF5DHN33ILW5Z46TNSRWR2GXPRUEDD",
  verifierId:
    process.env.NEXT_PUBLIC_PROOFPAY_VERIFIER_ID ??
    "CCPWNL7ASCMTOCKFPLKSQYMFSZEIZ7PI3MRNPU4OAZGSG2EOXSWD6LXW",
  root:
    process.env.NEXT_PUBLIC_PROOFPAY_ROOT ??
    "0x143e346ea19e713db9f6a128bc6852ce185211dc659193bbcad66e2956b6f095",
  rootExpiresAt: Number(
    process.env.NEXT_PUBLIC_PROOFPAY_ROOT_EXPIRES_AT ?? "1790553599"
  ),
  nativeTokenContractId:
    process.env.NEXT_PUBLIC_STELLAR_NATIVE_TOKEN_ID ??
    "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
} as const;

export const liveProof = {
  verificationTx:
    "f6825fa68181c29db87f271e851ad1b75ac99c617977cc7b38c1f5c21e6d55cc",
  rootRegistrationTx:
    "d4882534d9be19ff84f203a83dba5be0c19dba208ea169d2e7e2c54a83551359",
  escrowInvoiceId: "1",
  escrowCreateTx:
    "668adf31422e3177af617fd88b524c579d5910cc9879e15a8b77d61dd0845b1c",
  escrowFundTx:
    "93987cc2c14b0b732713d9614209593e32647e2c11ad1879934f0bb03859fc55",
  escrowReleaseTx:
    "43ec2d74b41920d2e07e9b7e4510b05a8fec0aa66dcd273627a4b2057e509ac6"
} as const;

export function stellarExpertContractUrl(contractId: string): string {
  return `${networkConfig.explorerBase}/${contractId}`;
}

export function stellarExpertTxUrl(txHash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
}
