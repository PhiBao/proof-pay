# Live Proof

This document records the current ProofPay testnet evidence and local verification path.

## Network

- Network: Stellar testnet
- RPC: `https://soroban-testnet.stellar.org`
- Source account alias used for deployment: `proofpay-deployer`

## Contracts

- Verifier: `CC7TO4Y3ZHTFBPSXZXC6Y2WN4PJ5MGXTI5YOENRDFATSLOSLWARI2JCO`
- ProofPay: `CAVFYHBACVPGVY6COJ62UU7XHPJJZXQ2FMMRRGHBODRV3RGXJYPGIDKA`
- Registered root: `0x143e346ea19e713db9f6a128bc6852ce185211dc659193bbcad66e2956b6f095`
- Verifier WASM hash: `b737fe9e4d7d411df508526ab30f7b5b8e9beb11e888003d0d4e255724004b18`
- ProofPay WASM hash: `dfad339ec6f5ac07cce786d47755794d355f390cf3fb3ab00433a903172862f1`

## Deployment Transactions

- Verifier deploy: https://stellar.expert/explorer/testnet/tx/445b0e9b8801b5111ff8677afbe1220acd278e3f5319328ae619a71cd8bc93a4
- ProofPay deploy: https://stellar.expert/explorer/testnet/tx/22a5db0a11a45aa9506b46c1a02a312eaaa99f9b3fb222c31507245a2cef05e2
- Issuer authorization: https://stellar.expert/explorer/testnet/tx/e4326f00ad33b5f12510fad10750f1a5adb728fd8211ba7669ce23f52ae69663
- Root registration: https://stellar.expert/explorer/testnet/tx/0bf8421cf0bd06db8362fc7b80d52a397f3dfd2bc92403b5a996025d8d9bda93
- Proof verification: https://stellar.expert/explorer/testnet/tx/175a524cd9c62b7808a38e5f15c80f1f99dc3335be20f9be13d0e068ef2b939d

## Recorded Escrow Transaction Trace

- Escrow invoice created: https://stellar.expert/explorer/testnet/tx/c9325ccdfda0863b4bb0f51631fe6dd230bfe8df465b917c9b87f7cb37f5d6e0
- Escrow funded: https://stellar.expert/explorer/testnet/tx/099e45c419d1a768b212f02692a3fab8322f318736499e983dcfc16c564a183f
- Escrow released by proof: https://stellar.expert/explorer/testnet/tx/abe1a23e2f89f24c02ab6e2d0c1424772c243a77818265d99af21a21b53b8fef

## Current Invoice Simulation Evidence

Invoice `4` on the current deployment is funded and unreleased. The app generated a fresh proof for that invoice's stored hash:

```text
0x1b77246d373515a1010a95c382d7c6ea3eaf7e007ac4ae9671f1e0ee3ecda604
```

The generated `public_inputs` artifact matched that hash and did not contain the old static fixture hash `0x0000000000000000000000000000000000000000000000000000000001ce2026`.

Local simulation of `verify_and_release` for invoice `4` succeeded and emitted:

- token transfer of `75000000` stroops to the contractor
- `InvoiceReleasedEvent`
- nullifier `0x1573b745b0256910f68fd1b930d7317afabf2e1b14491f9dc7d49a0b48e8be58`

The simulation used `--send no`, so it verified execution without submitting the release transaction.

## Verification Commands

```bash
pnpm typecheck
pnpm lint
pnpm build
cargo test --workspace
stellar contract build
just build-circuit
just circuit-negative
just verify-testnet
```

## Public-Input Mismatch Guard

The app now validates that the generated proof artifact bytes match the JSON public inputs before returning a proof to the claim page. This prevents the browser from submitting stale `public_inputs` bytes for a different invoice hash.
