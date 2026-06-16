#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="$ROOT_DIR/certificates"
CERT_FILE="$CERT_DIR/localhost.pem"
KEY_FILE="$CERT_DIR/localhost-key.pem"

mkdir -p "$CERT_DIR"

if [[ ! -f "$CERT_FILE" || ! -f "$KEY_FILE" ]]; then
  openssl req \
    -x509 \
    -newkey rsa:2048 \
    -nodes \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -days 365 \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
    >/dev/null 2>&1
fi

exec next dev \
  --experimental-https \
  --experimental-https-key "$KEY_FILE" \
  --experimental-https-cert "$CERT_FILE"
