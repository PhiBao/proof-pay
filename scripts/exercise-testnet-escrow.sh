#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.nargo/bin:$HOME/.bb:$HOME/.bb/bin:$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

if [[ -f "$ROOT_DIR/.proofpay/testnet.env" ]]; then
  set -a
  source "$ROOT_DIR/.proofpay/testnet.env"
  set +a
fi

NETWORK="${STELLAR_NETWORK_NAME:-testnet}"
SOURCE_ACCOUNT="${STELLAR_SOURCE_ACCOUNT:-proofpay-deployer}"
CONTRACT_ID="${PROOFPAY_CONTRACT_ID:-}"
ROOT_HEX="${PROOFPAY_ROOT:-}"
EXPIRES_AT="${PROOFPAY_ROOT_EXPIRES_AT:-1790553599}"
ARTIFACT_DIR="$ROOT_DIR/.proofpay"
ESCROW_ENV="$ARTIFACT_DIR/escrow.env"

if [[ -z "$CONTRACT_ID" || -z "$ROOT_HEX" ]]; then
  echo "Missing PROOFPAY_CONTRACT_ID or PROOFPAY_ROOT. Run just deploy-testnet first."
  exit 1
fi

if [[ -f "$ESCROW_ENV" && "${PROOFPAY_FORCE_ESCROW:-0}" != "1" ]]; then
  echo "$ESCROW_ENV already exists. This proof nullifier is single-use on one deployment."
  echo "Redeploy or set PROOFPAY_FORCE_ESCROW=1 if you intentionally want to retry."
  exit 1
fi

mkdir -p "$ARTIFACT_DIR"

cd "$ROOT_DIR"
./scripts/build-proofpay-circuit.sh qualified

PAYER_ADDRESS="$(stellar keys address "$SOURCE_ACCOUNT")"
PAYEE_ADDRESS="${PROOFPAY_DEMO_PAYEE:-$PAYER_ADDRESS}"
TOKEN_ID="$(stellar contract id asset --asset native --network "$NETWORK")"
ROOT_BYTES="${ROOT_HEX#0x}"
PAYEE_HASH="$(node scripts/toml-field-to-hex.mjs circuits/proofpay/Prover.qualified.toml payee_hash)"
PAYEE_HASH="${PAYEE_HASH#0x}"
INVOICE_HASH="$(node scripts/toml-field-to-hex.mjs circuits/proofpay/Prover.qualified.toml invoice_hash)"
INVOICE_HASH="${INVOICE_HASH#0x}"
NULLIFIER="$(node scripts/toml-field-to-hex.mjs circuits/proofpay/Prover.qualified.toml nullifier)"

run_invoke() {
  local label="$1"
  shift
  local output
  local status
  set +e
  output="$(stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$SOURCE_ACCOUNT" \
    --network "$NETWORK" \
    --send yes \
    --no-cache \
    -- "$@" 2>&1)"
  status=$?
  set -e
  printf "%s\n" "$output" | tee "$ARTIFACT_DIR/$label.log" >&2
  if [[ "$status" -ne 0 ]]; then
    exit "$status"
  fi
  printf "%s\n" "$output" | sed -n 's/.*Signing transaction: //p' | tail -n 1
}

CREATE_TX="$(run_invoke create-invoice \
  create_invoice \
  --payer "$PAYER_ADDRESS" \
  --payee "$PAYEE_ADDRESS" \
  --token "$TOKEN_ID" \
  --amount 75000000 \
  --root "$ROOT_BYTES" \
  --payee_hash "$PAYEE_HASH" \
  --invoice_hash "$INVOICE_HASH" \
  --min_total_cents 1200000 \
  --min_paid_count 12 \
  --period_bucket 202606 \
  --expires_at "$EXPIRES_AT")"

INVOICE_ID="$(sed -n 's/.*invoice_id: \([0-9][0-9]*\).*/\1/p' "$ARTIFACT_DIR/create-invoice.log" | head -n 1)"
if [[ -z "$INVOICE_ID" ]]; then
  echo "Could not parse created invoice id."
  exit 1
fi

FUND_TX="$(run_invoke fund-invoice \
  fund_invoice \
  --invoice_id "$INVOICE_ID")"

RELEASE_TX="$(run_invoke release-invoice \
  verify_and_release \
  --invoice_id "$INVOICE_ID" \
  --public_inputs-file-path "$ROOT_DIR/circuits/proofpay/target/public_inputs" \
  --proof_bytes-file-path "$ROOT_DIR/circuits/proofpay/target/proof")"

cat > "$ESCROW_ENV" <<EOF
PROOFPAY_ESCROW_INVOICE_ID=$INVOICE_ID
PROOFPAY_ESCROW_PAYER=$PAYER_ADDRESS
PROOFPAY_ESCROW_PAYEE=$PAYEE_ADDRESS
PROOFPAY_ESCROW_AMOUNT_STROOPS=75000000
PROOFPAY_ESCROW_CREATE_TX=$CREATE_TX
PROOFPAY_ESCROW_FUND_TX=$FUND_TX
PROOFPAY_ESCROW_RELEASE_TX=$RELEASE_TX
PROOFPAY_ESCROW_NULLIFIER=$NULLIFIER
EOF

echo "Invoice: $INVOICE_ID"
echo "Create tx: $CREATE_TX"
echo "Fund tx: $FUND_TX"
echo "Release tx: $RELEASE_TX"
echo "Saved $ESCROW_ENV"
