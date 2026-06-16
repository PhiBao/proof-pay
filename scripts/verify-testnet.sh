#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.nargo/bin:$HOME/.bb:$HOME/.bb/bin:$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

if [[ -f "$ROOT_DIR/.proofpay/testnet.env" ]]; then
  set -a
  source "$ROOT_DIR/.proofpay/testnet.env"
  set +a
fi

CONTRACT_ID="${PROOFPAY_VERIFIER_ID:-${1:-}}"
if [[ -z "$CONTRACT_ID" ]]; then
  echo "Usage: PROOFPAY_VERIFIER_ID=<id> ./scripts/verify-testnet.sh"
  exit 1
fi

stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "${STELLAR_SOURCE_ACCOUNT:-proofpay-deployer}" \
  --network "${STELLAR_NETWORK_NAME:-testnet}" \
  --send yes \
  -- \
  verify_proof \
  --public_inputs-file-path "$ROOT_DIR/circuits/proofpay/target/public_inputs" \
  --proof_bytes-file-path "$ROOT_DIR/circuits/proofpay/target/proof"

echo "Verifier accepted ProofPay proof on ${STELLAR_NETWORK_NAME:-testnet}"

