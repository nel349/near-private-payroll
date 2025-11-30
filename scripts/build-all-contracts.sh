#!/bin/bash
set -e

# NEAR Private Payroll - Build All Contracts
# Builds all smart contracts for deployment
#
# Usage: ./scripts/build-all.sh

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_header() {
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_header "Building All Contracts"

# Check if cargo-near is installed
if ! command -v cargo-near &> /dev/null; then
    print_info "cargo-near not found. Installing..."
    cargo install cargo-near
    print_success "cargo-near installed"
fi

CONTRACTS=("wzec-token" "zk-verifier" "payroll" "intents-adapter")

for contract in "${CONTRACTS[@]}"; do
    print_header "Building: $contract"

    cd "contracts/$contract"

    print_info "Running cargo near build..."
    echo -e "\n\n" | cargo near build non-reproducible-wasm

    print_success "$contract built successfully"

    cd ../..
done

print_header "Build Summary"

echo ""
print_success "All contracts built successfully!"
echo ""
echo "WASM files location: ./target/near/"
echo ""
ls -lh target/near/*//*.wasm 2>/dev/null || echo "No WASM files found"
echo ""

print_success "Ready for deployment! Run: ./scripts/deploy-testnet.sh <your-account.testnet>"
echo ""
