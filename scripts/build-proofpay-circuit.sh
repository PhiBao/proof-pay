#!/usr/bin/env bash
set -euo pipefail

PERSONA="${1:-qualified}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CIRCUIT_DIR="$ROOT_DIR/circuits/proofpay"
LOCK_DIR="$ROOT_DIR/.proofpay"

export PATH="$HOME/.nargo/bin:$HOME/.bb:$HOME/.bb/bin:$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

mkdir -p "$LOCK_DIR"
exec 9>"$LOCK_DIR/circuit.lock"
flock 9

cd "$ROOT_DIR"
cargo run \
  --example populate_publics \
  --manifest-path contracts/proofpay/Cargo.toml \
  --features std

case "$PERSONA" in
  qualified)
    cp "$CIRCUIT_DIR/Prover.qualified.toml" "$CIRCUIT_DIR/Prover.toml"
    ;;
  unqualified)
    cp "$CIRCUIT_DIR/Prover.unqualified.toml" "$CIRCUIT_DIR/Prover.toml"
    ;;
  *)
    echo "Unknown persona: $PERSONA"
    exit 1
    ;;
esac

cd "$CIRCUIT_DIR"
nargo compile

if [[ "$PERSONA" == "unqualified" ]]; then
  if nargo execute; then
    echo "Expected unqualified proof execution to fail, but it passed."
    exit 1
  fi
  echo "Unqualified proof failed as expected."
  cp "$CIRCUIT_DIR/Prover.qualified.toml" "$CIRCUIT_DIR/Prover.toml"
  exit 0
fi

nargo execute

bb prove \
  --scheme ultra_honk \
  --oracle_hash keccak \
  --bytecode_path target/proofpay.json \
  --witness_path target/proofpay.gz \
  --output_path target \
  --output_format bytes_and_fields

bb write_vk \
  --scheme ultra_honk \
  --oracle_hash keccak \
  --bytecode_path target/proofpay.json \
  --output_path target \
  --output_format bytes_and_fields

if [[ -d target/vk && -f target/vk/vk ]]; then
  mv target/vk/vk target/vk.tmp
  rmdir target/vk
  mv target/vk.tmp target/vk
fi

if [[ -d target/vk_fields.json && -f target/vk_fields.json/vk_fields.json ]]; then
  mv target/vk_fields.json/vk_fields.json target/vk_fields.json.tmp
  rmdir target/vk_fields.json
  mv target/vk_fields.json.tmp target/vk_fields.json
fi

echo "ProofPay circuit artifacts ready in circuits/proofpay/target"
