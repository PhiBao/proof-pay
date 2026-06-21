# ProofPay

ProofPay is a private contractor trust checkout for Stellar invoice escrow.

A client can create and fund a milestone invoice, share a claim link, and let the contractor release payment only after generating a zero-knowledge proof that they meet the agreed paid-work policy. The contractor proves enough to earn trust without revealing exact revenue, prior client names, invoice rows, or credential secrets.

## Why ProofPay Exists

First-time freelance payments often get stuck on trust.

Clients want evidence that a contractor has delivered paid work before funding a milestone. Contractors do not want to send screenshots, expose revenue totals, or reveal past customer relationships. Existing marketplace reputation is not portable, and direct-hire work usually falls back to manual references.

ProofPay turns that trust check into an invoice-bound proof:

- the payer locks funds in Stellar escrow
- the claim link carries the exact invoice policy
- the contractor proves privately that an issuer-attested credential clears the policy
- the Soroban contract releases escrow only if the proof and invoice match

The product thesis is private portable reputation for paid work, not a generic invoice app.

## Product Flow

ProofPay has two sides.

**Payer side:** The client reviews or edits the invoice terms, connects Freighter on Stellar testnet, commits the terms, creates the escrow invoice, funds it, and receives a claim link.

**Contractor side:** The contractor opens the claim link, ProofPay validates the funded invoice on-chain, generates a fresh Noir/Barretenberg proof for that invoice commitment, and submits `verify_and_release`.

The payer does not generate the proof. The contractor does. The release proof is bound to the funded invoice through `invoice_hash`, so a proof generated for one invoice cannot release a different invoice.

## What Is Real Today

- Next.js product UI with payer workspace and contractor claim page.
- Freighter wallet connection and Stellar testnet transaction signing.
- Soroban ProofPay escrow contract with issuer authorization, root registration, invoice creation, funding, cancellation, nullifier storage, and proof-gated release.
- Soroban verifier contract using `rs-soroban-ultrahonk`.
- Noir circuit proving paid-work threshold satisfaction, Merkle membership, and invoice-bound nullifier correctness.
- Barretenberg proof generation from the claim page API.
- Runtime proof generation for the exact claim-link invoice hash.
- Public-input artifact validation before the API returns a proof, preventing stale proof bytes from being submitted.

## What Is Fixture-Backed

- The issuer credential is deterministic demo data.
- There is no live Stripe, Upwork, bank, payroll, or accounting connector yet.
- The proof period is fixed to `202606`.
- The demo verified contractor profile is static.
- Local proof generation requires `cargo`, `nargo`, and `bb` on the machine running the app.

These are MVP boundaries, not hidden claims. The real product next step is issuer integration.

## What The ZK Proof Proves

The Noir circuit proves:

- the private aggregate paid-work total is at least the public invoice minimum
- the private paid-invoice count is at least the public invoice minimum
- the credential leaf belongs to the public issuer Merkle root
- the nullifier equals `Poseidon2(credential_secret, invoice_hash)`

The proof does not reveal:

- exact historical revenue
- prior client names
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

## What Stellar Enforces

`verify_and_release(invoice_id, public_inputs, proof_bytes)` checks:

- invoice exists
- invoice is funded
- invoice is not cancelled or already released
- public inputs match the stored invoice policy
- issuer root is registered and unexpired
- nullifier has not been used
- external verifier accepts the UltraHonk proof

Only then does the contract transfer escrow to the payee and mark the invoice released.

## Current Testnet Deployment

- Network: Stellar testnet
- RPC: `https://soroban-testnet.stellar.org`
- ProofPay: `CAVFYHBACVPGVY6COJ62UU7XHPJJZXQ2FMMRRGHBODRV3RGXJYPGIDKA`
- Verifier: `CC7TO4Y3ZHTFBPSXZXC6Y2WN4PJ5MGXTI5YOENRDFATSLOSLWARI2JCO`
- Registered root: `0x143e346ea19e713db9f6a128bc6852ce185211dc659193bbcad66e2956b6f095`

Evidence:

- Issuer authorization: https://stellar.expert/explorer/testnet/tx/e4326f00ad33b5f12510fad10750f1a5adb728fd8211ba7669ce23f52ae69663
- Root registration: https://stellar.expert/explorer/testnet/tx/0bf8421cf0bd06db8362fc7b80d52a397f3dfd2bc92403b5a996025d8d9bda93
- Proof verification: https://stellar.expert/explorer/testnet/tx/175a524cd9c62b7808a38e5f15c80f1f99dc3335be20f9be13d0e068ef2b939d
- Recorded escrow release: https://stellar.expert/explorer/testnet/tx/abe1a23e2f89f24c02ab6e2d0c1424772c243a77818265d99af21a21b53b8fef

Additional local verification on the current app generated proof bytes for funded invoice `4` and simulated `verify_and_release` successfully. The simulation emitted the expected token transfer and `InvoiceReleasedEvent`; it was not submitted, so invoice `4` remains usable for browser release.

## Repository Layout

- `src/app` - payer UI, claim UI, API routes, app icon
- `src/lib` - wallet helpers, app config, claim-link encoding, invoice canonicalization, proof artifact loading
- `src/contracts/proofpay` - generated TypeScript bindings for the ProofPay contract
- `circuits/proofpay` - Noir paid-work proof circuit
- `contracts/proofpay` - Soroban escrow and proof-gated release contract
- `contracts/verifier` - Soroban UltraHonk verifier contract
- `scripts` - deployment, verification, and escrow exercise scripts
- `docs` - live proof notes

## Local Setup

Install dependencies:

```bash
pnpm install
```

Start the HTTPS dev server:

```bash
pnpm dev
```

Open:

```text
https://localhost:3000
```

The dev server uses a local self-signed certificate because wallet extensions behave more reliably on secure origins.

## Browser Demo

1. Open `/`.
2. Review or edit the payer invoice fields.
3. Connect Freighter on Stellar testnet.
4. Commit invoice terms.
5. Create the escrow invoice.
6. Fund the escrow.
7. Copy or open the claim link.
8. On `/claim/[invoiceId]`, generate the private proof.
9. Connect Freighter as the contractor.
10. Release escrow.
11. Open the claim audit trail and Stellar explorer links.

If release fails with a public-input mismatch, reload the claim page and generate a fresh proof. Old proof artifacts are invoice-specific and should not be reused.

## Commands

Build the valid proof artifacts:

```bash
just build-circuit
```

Run the below-threshold negative case:

```bash
just circuit-negative
```

Build Soroban WASM:

```bash
just build-contracts
```

Verify the current proof against the deployed verifier:

```bash
just verify-testnet
```

Deploy fresh testnet contracts:

```bash
just deploy-testnet
```

Exercise a full testnet escrow path:

```bash
just exercise-testnet-escrow
```

## Quality Checks

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

## Security Notes

- Release is permissionless, but proof verification and invoice public-input matching gate payment.
- Nullifiers are stored on-chain and cannot be reused.
- Issuer roots must be registered by an authorized issuer.
- Root expiration is checked during release.
- Cancelled, unfunded, and already released invoices cannot be released.
- Demo credentials are not real attestations.

## Roadmap

- Replace fixture credentials with signed issuer credentials from a real payment or freelancer platform.
- Move proof generation into a better worker/server job experience with progress states.
- Support multiple contractor profiles and issuer roots.
- Add hosted deployment and smoother wallet onboarding.
- Add issuer credential revocation and refresh flows.
- Expand escrow tokens beyond testnet XLM for stablecoin-oriented workflows.
