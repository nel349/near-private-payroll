#!/bin/bash
# Script to register circuit image IDs on-chain
#
# Usage: ./scripts/register_image_ids.sh <contract-account-id> <signer-account-id>
# Example: ./scripts/register_image_ids.sh zk-verifier.testnet alice.testnet

set -e

# Check arguments
if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <contract-account-id> <signer-account-id>"
    echo "Example: $0 zk-verifier.testnet alice.testnet"
    exit 1
fi

CONTRACT_ID=$1
SIGNER_ID=$2

echo "=== Circuit Image ID Registration ==="
echo "Contract: $CONTRACT_ID"
echo "Signer: $SIGNER_ID"
echo ""
echo "⚠️  IMPORTANT: This script registers image IDs for built circuits."
echo "   Make sure you have built the circuits first:"
echo "   ./scripts/build-circuits.sh"
echo ""
echo "Computing image IDs from circuit ELF binaries..."
echo ""

# Check if circuits are built
if [ ! -d "target/riscv32im-risc0-zkvm-elf/docker" ]; then
    echo "Error: Circuits not found. Please build them first:"
    echo "  ./scripts/build-circuits.sh"
    exit 1
fi

# Compute image IDs using cargo test
echo "Running cargo test to compute image IDs..."
IMAGE_IDS=$(cargo test -p proof-server --test compute_image_ids -- --nocapture 2>&1 | grep "Image ID (bytes)")

if [ -z "$IMAGE_IDS" ]; then
    echo "Error: Failed to compute image IDs"
    echo "Make sure all circuits are built in target/riscv32im-risc0-zkvm-elf/docker/"
    exit 1
fi

echo "✅ Image IDs computed successfully"
echo ""

# Parse image IDs from test output
# This is a simplified approach - in production, you might want to parse JSON output
echo "⚠️  Manual Registration Required"
echo ""
echo "Due to the complexity of parsing image IDs from test output,"
echo "please run the following command to get the exact registration commands:"
echo ""
echo "  cargo test -p proof-server --test compute_image_ids -- --nocapture"
echo ""
echo "The test output will show exact 'near call' commands with the correct image_id arrays."
echo ""
echo "Example output format:"
echo "  near call zk-verifier.testnet register_image_id \\"
echo "    '{\"proof_type\":\"income_threshold\",\"image_id\":[1,2,3,...,32]}' \\"
echo "    --accountId $SIGNER_ID --gas 300000000000000"
echo ""

# Offer to run the test for the user
read -p "Would you like to run the test now to see the commands? (y/n) " -n 1 -r
echo
if [[ $REPL =~ ^[Yy]$ ]]; then
    cargo test -p proof-server --test compute_image_ids -- --nocapture
    echo ""
    echo "Copy and run the 'near call' commands shown above."
fi

echo ""
echo "=== Notes ==="
echo "• Each circuit has a unique image_id (hash of the ELF binary)"
echo "• Image IDs must be registered AFTER the verification key"
echo "• If you rebuild a circuit, its image_id will change (must re-register)"
echo "• The verification key stays the same (never changes)"
