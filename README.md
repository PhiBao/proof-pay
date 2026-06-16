# ProofPay

ProofPay is a private work-proof checkout for Stellar invoice escrow.

Freelancers and small studios often need to prove they have real paid-work history before a client funds a milestone. Today that usually means exposing screenshots, revenue totals, past client names, or references. ProofPay changes that flow: the client can fund escrow after seeing a cryptographic proof that the freelancer meets a reputation threshold, without seeing the underlying work history.

## What The App Does

ProofPay has three user-facing parts:

- **Client invoice draft:** the client enters the client name, project, and XLM amount for a testnet escrow invoice.
- **Private proof check:** the freelancer proves an issuer-attested paid-work credential clears the client threshold.
- **Stellar escrow release:** the Soroban contract releases escrow only after the proof verifies and the public proof inputs match the invoice policy.

The visible invoice starts as a blank client draft. The current MVP keeps the verified freelancer profile and proof policy fixed to the demo credential so the ZK path stays real and reproducible.

## Why This Matters

For higher-trust freelance work, the first payment is often blocked by reputation checks. Buyers want confidence before funding. Freelancers want privacy around revenue, prior clients, and deal volume. ProofPay makes the reputation check binary and reusable:

- client learns the freelancer meets the threshold
- freelancer keeps raw business history private
- escrow cannot release unless the proof is accepted on Stellar

This is not a token product and not a compliance product. The product is private reputation for paid work.

## Current Demo Status

What is real:

- Noir circuit proves threshold satisfaction and Merkle membership.
- Barretenberg creates an UltraHonk proof.
- A Stellar testnet verifier contract accepts the proof.
- ProofPay escrow contract stores issuer roots, creates invoices, funds escrow, checks nullifiers, and releases payment after proof verification.
- The browser uses Freighter for wallet connection and contract signing.

What is fixture-backed:

- The issuer credential is deterministic demo data, not a live Stripe, Upwork, bank, or accounting integration.
- The freelancer profile is a demo verified profile.
- The proof policy is fixed for the MVP: at least `$12,000` paid work and at least `12` paid invoices in period `202606`.
- The invoice form collects client/project/amount. Custom amount feeds the on-chain escrow amount; the reputation proof still uses the fixed demo proof policy.

## User Flow

1. Client opens ProofPay and edits the invoice draft.
2. Client checks the freelancer's private work proof.
3. ProofPay loads the generated proof and public inputs.
4. Client connects Freighter on Stellar testnet.
5. Client creates the escrow invoice.
6. Client funds escrow.
7. ProofPay submits `verify_and_release`.
8. Contract verifies the proof, marks the nullifier used, and releases XLM to the freelancer.

## What The ZK Proof Proves

The Noir circuit proves:

- the private aggregate paid-work total is at least the public minimum
- the private paid-invoice count is at least the public minimum
- the credential leaf belongs to the public issuer Merkle root
- the nullifier equals `Poseidon2(credential_secret, invoice_hash)`

The proof does not reveal:

- exact historical revenue
- past client names
- raw invoice rows
- credential secret
- Merkle path

Public proof inputs:

- `root`
- `payee_hash`
- `invoice_hash`
- `min_total_cents`
- `min_paid_count`
- `period_bucket`
- `nullifier`

## What Stellar Does

The Stellar side has two contracts:

- **Verifier contract:** stores the verification key and verifies UltraHonk proofs.
- **ProofPay contract:** manages issuer roots, invoices, escrow funding, nullifier use, and proof-gated release.

`verify_and_release(invoice_id, public_inputs, proof_bytes)` checks:

- invoice exists and is funded
- issuer root is registered and unexpired
- public proof inputs match the invoice policy
- nullifier has not been used
- external verifier accepts the proof

Only then does the contract transfer escrow to the payee.

## Current Testnet Deployment

- Network: Stellar testnet
- RPC: `https://soroban-testnet.stellar.org`
- Verifier: `CCPWNL7ASCMTOCKFPLKSQYMFSZEIZ7PI3MRNPU4OAZGSG2EOXSWD6LXW`
- ProofPay: `CDMJGLNX4DL4ZUUMR6LOWKL6SAOF5DHN33ILW5Z46TNSRWR2GXPRUEDD`
- Registered root: `0x143e346ea19e713db9f6a128bc6852ce185211dc659193bbcad66e2956b6f095`
- Latest proof verification: https://stellar.expert/explorer/testnet/tx/f6825fa68181c29db87f271e851ad1b75ac99c617977cc7b38c1f5c21e6d55cc
- Recorded full escrow release trace: https://stellar.expert/explorer/testnet/tx/43ec2d74b41920d2e07e9b7e4510b05a8fec0aa66dcd273627a4b2057e509ac6

The recorded escrow trace shows a previous deployment successfully creating, funding, verifying, and releasing an invoice. The current app deployment is fresh so the browser flow can release once with the demo nullifier.

## Stack

- Next.js, React, TypeScript, Tailwind CSS
- Freighter wallet API
- Rust Soroban contracts
- Generated TypeScript bindings from Stellar CLI
- Noir `1.0.0-beta.9`
- Barretenberg `0.87.0`
- Stellar CLI `26.1.0`
- `rs-soroban-ultrahonk`

## Repository Layout

- `src/app` - checkout UI and demo APIs
- `src/lib` - wallet adapter, app config, proof artifact loading, contract client helpers
- `src/contracts/proofpay` - generated TypeScript bindings
- `circuits/proofpay` - Noir credential-threshold circuit
- `contracts/verifier` - UltraHonk verifier contract
- `contracts/proofpay` - escrow, root registry, nullifier registry, lifecycle events
- `scripts` - proof build, deployment, verification, and escrow exercise scripts
- `docs/LIVE_PROOF.md` - deployed contract and transaction evidence

## Local Setup

Install dependencies:

```bash
pnpm install
```

Start the app:

```bash
pnpm dev
```

Open:

```text
https://localhost:3000
```

The dev script creates a local self-signed certificate and starts Next.js over HTTPS because wallet extensions are more reliable on secure origins.

## Proof And Contract Commands

Build the valid proof artifacts:

```bash
just build-circuit
```

Run the below-threshold failure case:

```bash
just circuit-negative
```

Build Soroban WASM:

```bash
just build-contracts
```

Deploy fresh testnet verifier and ProofPay contracts:

```bash
just deploy-testnet
```

Verify the current proof against the deployed verifier:

```bash
just verify-testnet
```

Exercise a full testnet escrow path on a fresh deployment:

```bash
just exercise-testnet-escrow
```

The demo proof nullifier is single-use per deployment. If `verify_and_release` returns `NullifierUsed`, deploy fresh contracts and run the flow again.

## Quality Checks

```bash
pnpm lint
pnpm typecheck
pnpm build
cargo test --workspace
stellar contract build
just build-circuit
just circuit-negative
just verify-testnet
```

## Security Model

- The payer must authorize invoice creation and funding.
- Release is permissionless, but proof verification, invoice public-input matching, registered root checks, and nullifier checks gate the transfer.
- Nullifier replay is rejected by persistent contract storage.
- Expired invoices can be cancelled by the payer.
- Demo credentials are fixtures and should not be treated as real-world attestations.

## Product Roadmap

The next product steps are:

- replace deterministic demo credentials with signed issuer credentials from real payment platforms
- generate proofs per invoice in a local/browser prover worker
- derive `invoice_hash` from the user-created invoice payload
- support multiple verified freelancer profiles
- add hosted deployment with a smoother wallet onboarding path
- add a lightweight issuer console for credential issuance and revocation
