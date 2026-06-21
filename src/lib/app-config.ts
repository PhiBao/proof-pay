import { networkConfig } from "@/lib/demo-data";

export const proofpayDeployment = {
  contractId:
    process.env.NEXT_PUBLIC_PROOFPAY_CONTRACT_ID ??
    "CAVFYHBACVPGVY6COJ62UU7XHPJJZXQ2FMMRRGHBODRV3RGXJYPGIDKA",
  verifierId:
    process.env.NEXT_PUBLIC_PROOFPAY_VERIFIER_ID ??
    "CC7TO4Y3ZHTFBPSXZXC6Y2WN4PJ5MGXTI5YOENRDFATSLOSLWARI2JCO",
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
    "175a524cd9c62b7808a38e5f15c80f1f99dc3335be20f9be13d0e068ef2b939d",
  issuerAuthorizationTx:
    "e4326f00ad33b5f12510fad10750f1a5adb728fd8211ba7669ce23f52ae69663",
  rootRegistrationTx:
    "0bf8421cf0bd06db8362fc7b80d52a397f3dfd2bc92403b5a996025d8d9bda93",
  escrowInvoiceId: "1",
  escrowCreateTx:
    "c9325ccdfda0863b4bb0f51631fe6dd230bfe8df465b917c9b87f7cb37f5d6e0",
  escrowFundTx:
    "099e45c419d1a768b212f02692a3fab8322f318736499e983dcfc16c564a183f",
  escrowReleaseTx:
    "abe1a23e2f89f24c02ab6e2d0c1424772c243a77818265d99af21a21b53b8fef"
} as const;

export function stellarExpertContractUrl(contractId: string): string {
  return `${networkConfig.explorerBase}/${contractId}`;
}

export function stellarExpertTxUrl(txHash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${txHash}`;
}
