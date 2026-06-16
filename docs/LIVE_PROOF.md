# Live Proof

## Network

- Network: Stellar testnet
- RPC: `https://soroban-testnet.stellar.org`
- Source account: `proofpay-deployer`

## Contracts

- Verifier: `CCPWNL7ASCMTOCKFPLKSQYMFSZEIZ7PI3MRNPU4OAZGSG2EOXSWD6LXW`
- ProofPay: `CDMJGLNX4DL4ZUUMR6LOWKL6SAOF5DHN33ILW5Z46TNSRWR2GXPRUEDD`
- Registered root: `0x143e346ea19e713db9f6a128bc6852ce185211dc659193bbcad66e2956b6f095`
- Verifier WASM hash: `b737fe9e4d7d411df508526ab30f7b5b8e9beb11e888003d0d4e255724004b18`
- ProofPay WASM hash: `39b36bbafaa74faec09829520c793065698873f95a737345405218723efa2af2`

## Transactions

- Verifier deploy: https://stellar.expert/explorer/testnet/tx/babdbd1c7da52a17ed9b3a54460df68e58411ea943a4a4b40ee5d091975a06fb
- ProofPay deploy: https://stellar.expert/explorer/testnet/tx/17750eb732317d8ac18036f16072b437ce5946b0d76bae66f1c1b82dfcfb8077
- Root registration: https://stellar.expert/explorer/testnet/tx/d4882534d9be19ff84f203a83dba5be0c19dba208ea169d2e7e2c54a83551359
- Proof verification: https://stellar.expert/explorer/testnet/tx/f6825fa68181c29db87f271e851ad1b75ac99c617977cc7b38c1f5c21e6d55cc

## Recorded Escrow Trace

- Escrow invoice created: https://stellar.expert/explorer/testnet/tx/668adf31422e3177af617fd88b524c579d5910cc9879e15a8b77d61dd0845b1c
- Escrow funded: https://stellar.expert/explorer/testnet/tx/93987cc2c14b0b732713d9614209593e32647e2c11ad1879934f0bb03859fc55
- Escrow released by proof: https://stellar.expert/explorer/testnet/tx/43ec2d74b41920d2e07e9b7e4510b05a8fec0aa66dcd273627a4b2057e509ac6

## Escrow State

- Invoice ID: `1`
- Amount: `75000000` stroops
- Released: `true`
- Nullifier used: `true`

## Local Evidence

```bash
pnpm typecheck
pnpm build
cargo test --workspace
stellar contract build
just build-circuit
just circuit-negative
just verify-testnet
just exercise-testnet-escrow
```
