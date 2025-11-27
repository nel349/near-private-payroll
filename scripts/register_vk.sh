#!/bin/bash
# Script to register RISC Zero Groth16 verification key on-chain
#
# Usage: ./scripts/register_vk.sh <contract-account-id> <signer-account-id>
# Example: ./scripts/register_vk.sh zk-verifier.testnet alice.testnet

set -e

# Check arguments
if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <contract-account-id> <signer-account-id>"
    echo "Example: $0 zk-verifier.testnet alice.testnet"
    exit 1
fi

CONTRACT_ID=$1
SIGNER_ID=$2
VK_FILE="$(dirname "$0")/risc0_vk.json"

# Check if VK file exists
if [ ! -f "$VK_FILE" ]; then
    echo "Error: Verification key file not found: $VK_FILE"
    echo "Run: cargo test -p proof-server --test format_vk_for_near -- --nocapture"
    exit 1
fi

echo "=== RISC Zero Groth16 Verification Key Registration ==="
echo "Contract: $CONTRACT_ID"
echo "Signer: $SIGNER_ID"
echo "VK File: $VK_FILE"
echo ""
echo "⚠️  IMPORTANT: RISC Zero uses ONE universal verification key for ALL circuits"
echo "   This script will register the SAME key for all proof types:"
echo "   - income_threshold"
echo "   - income_range"
echo "   - credit_score"
echo "   - payment"
echo "   - balance"
echo ""

# Read VK file
VK_JSON=$(cat "$VK_FILE")

# Register for each proof type
PROOF_TYPES=("income_threshold" "income_range" "credit_score" "payment" "balance")

for proof_type in "${PROOF_TYPES[@]}"; do
    echo "=== Registering VK for proof_type: $proof_type ==="

    # Call contract
    near call "$CONTRACT_ID" register_verification_key \
        "{\"proof_type\":\"$proof_type\",\"vk\":$VK_JSON}" \
        --accountId "$SIGNER_ID" \
        --gas 300000000000000 \
        --deposit 0

    echo ""
done

echo "=== Registration Complete ==="
echo "All proof types now use the RISC Zero universal verification key"
echo ""
echo "Next steps:"
echo "1. Generate a Groth16 proof using the proof-server"
echo "2. Submit the proof to the contract for verification"
echo "3. The contract will verify the proof using the registered VK"
