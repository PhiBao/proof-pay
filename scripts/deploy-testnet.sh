#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$HOME/.nargo/bin:$HOME/.bb:$HOME/.bb/bin:$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

SOURCE_ACCOUNT="${STELLAR_SOURCE_ACCOUNT:-proofpay-deployer}"
NETWORK="${STELLAR_NETWORK_NAME:-testnet}"
ARTIFACT_DIR="$ROOT_DIR/.proofpay"
mkdir -p "$ARTIFACT_DIR"
rm -f \
  "$ARTIFACT_DIR/escrow.env" \
  "$ARTIFACT_DIR/create-invoice.log" \
  "$ARTIFACT_DIR/fund-invoice.log" \
  "$ARTIFACT_DIR/release-invoice.log"

cd "$ROOT_DIR"
./scripts/build-proofpay-circuit.sh qualified
stellar contract build

VERIFIER_ID="$(stellar contract deploy \
  --wasm "$ROOT_DIR/target/wasm32v1-none/release/proofpay_verifier.wasm" \
  --source "$SOURCE_ACCOUNT" \
  --network "$NETWORK" \
  -- \
  --vk_bytes-file-path "$ROOT_DIR/circuits/proofpay/target/vk")"

ADMIN_ADDRESS="$(stellar keys address "$SOURCE_ACCOUNT")"
PROOFPAY_ID="$(stellar contract deploy \
  --wasm "$ROOT_DIR/target/wasm32v1-none/release/proofpay_contract.wasm" \
  --source "$SOURCE_ACCOUNT" \
  --network "$NETWORK" \
  -- \
  --admin "$ADMIN_ADDRESS" \
  --verifier "$VERIFIER_ID")"

ROOT_HEX="$(node scripts/toml-field-to-hex.mjs circuits/proofpay/Prover.qualified.toml root)"
ROOT_BYTES="${ROOT_HEX#0x}"
EXPIRES_AT="${PROOFPAY_ROOT_EXPIRES_AT:-1790553599}"

stellar contract invoke \
  --id "$PROOFPAY_ID" \
  --source "$SOURCE_ACCOUNT" \
  --network "$NETWORK" \
  --send yes \
  -- \
  register_root \
  --root "$ROOT_BYTES" \
  --issuer "$ADMIN_ADDRESS" \
  --expires_at "$EXPIRES_AT"

cat > "$ARTIFACT_DIR/testnet.env" <<EOF
STELLAR_NETWORK_NAME=$NETWORK
STELLAR_SOURCE_ACCOUNT=$SOURCE_ACCOUNT
PROOFPAY_VERIFIER_ID=$VERIFIER_ID
PROOFPAY_CONTRACT_ID=$PROOFPAY_ID
PROOFPAY_ROOT=$ROOT_HEX
PROOFPAY_ROOT_EXPIRES_AT=$EXPIRES_AT
EOF

echo "Verifier: $VERIFIER_ID"
echo "ProofPay: $PROOFPAY_ID"
echo "Root: $ROOT_HEX"
echo "Saved .proofpay/testnet.env"
