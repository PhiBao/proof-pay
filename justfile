set shell := ["bash", "-cu"]

build-circuit persona="qualified":
    ./scripts/build-proofpay-circuit.sh {{persona}}

circuit-negative:
    ./scripts/build-proofpay-circuit.sh unqualified

build-contracts:
    stellar contract build

deploy-testnet:
    ./scripts/deploy-testnet.sh

verify-testnet:
    ./scripts/verify-testnet.sh

exercise-testnet-escrow:
    ./scripts/exercise-testnet-escrow.sh

dev:
    pnpm dev

check:
    pnpm typecheck
    pnpm build
    cargo test --workspace
