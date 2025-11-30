#!/bin/bash

# Generate All Test Proofs Using REST API
# This script generates real Groth16 proofs for all circuit types
# and saves them to scripts/test_proofs/ for use in integration tests
#
# Prerequisites:
# 1. proof-server must be running:
#    ELF_DIR="$PWD/target/riscv32im-risc0-zkvm-elf/docker" cargo run -p proof-server --release
# 2. ELF binaries must be built:
#    cargo build --release --target riscv32im-risc0-zkvm-elf
#
# Usage: ./scripts/generate_all_test_proofs.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEST_PROOFS_DIR="$SCRIPT_DIR/test_proofs"
API_URL="${API_URL:-http://localhost:3000/api/v1/proof/generate}"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Generating Test Proofs via REST API          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
echo ""

# Create output directory
mkdir -p "$TEST_PROOFS_DIR"

# Check if server is running
echo -e "${YELLOW}Checking if proof-server is running...${NC}"
if ! curl -s -f "$API_URL" > /dev/null 2>&1; then
    if ! curl -s -f "http://localhost:3000/health" > /dev/null 2>&1; then
        echo -e "${RED}✗ proof-server is not running!${NC}"
        echo -e "${YELLOW}Start it with:${NC}"
        echo -e "  ELF_DIR=\"\$PWD/target/riscv32im-risc0-zkvm-elf/docker\" cargo run -p proof-server --release"
        exit 1
    fi
fi
echo -e "${GREEN}✓ proof-server is running${NC}\n"

# Function to generate a proof
generate_proof() {
    local proof_name=$1
    local json_payload=$2
    local output_file="$TEST_PROOFS_DIR/$proof_name.json"

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}Generating: $proof_name${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Request payload:"
    echo "$json_payload" | jq '.'
    echo ""
    echo -e "${YELLOW}Sending request to proof-server...${NC}"
    echo -e "${YELLOW}(This takes ~2 minutes per proof)${NC}"
    echo ""

    # Make the API request
    response=$(curl -s -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -d "$json_payload")

    # Check if request was successful (has receipt field)
    if echo "$response" | jq -e '.receipt' > /dev/null 2>&1; then
        echo "$response" | jq '.' > "$output_file"
        echo -e "${GREEN}✓ Proof generated successfully!${NC}"
        echo -e "${GREEN}  Saved to: $output_file${NC}"

        # Show proof details
        local receipt_size=$(echo "$response" | jq -r '.receipt | length')
        local image_id=$(echo "$response" | jq -r '.image_id[:8] | map(tostring) | join(",")')
        local gen_time=$(echo "$response" | jq -r '.generation_time_ms')
        echo -e "${GREEN}  Receipt size: $receipt_size bytes${NC}"
        echo -e "${GREEN}  Image ID: [$image_id...]${NC}"
        echo -e "${GREEN}  Generation time: ${gen_time}ms (~$((gen_time/1000))s)${NC}"
    else
        echo -e "${RED}✗ Proof generation failed!${NC}"
        echo "Response:"
        echo "$response" | jq '.'
        return 1
    fi
    echo ""
}

# ============================================================================
# 1. Income Range Proof
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  1/4: Income Range Proof                                 ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

generate_proof "income_range" '{
  "proof_type": "income_range",
  "params": {
    "payment_history": [4000, 5000, 6000],
    "min": 3000,
    "max": 7000,
    "history_commitment": [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    "employee_id": "alice.near"
  }
}'

# ============================================================================
# 2. Credit Score Proof
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  2/4: Credit Score Proof                                 ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

generate_proof "credit_score" '{
  "proof_type": "credit_score",
  "params": {
    "payment_history": [5000, 5100, 5050, 4950, 5200, 4900],
    "expected_salary": 5000,
    "threshold": 500,
    "history_commitment": [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    "employee_id": "alice.near"
  }
}'

# ============================================================================
# 3. Average Income Proof
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  3/4: Average Income Proof                               ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

generate_proof "average_income" '{
  "proof_type": "average_income",
  "params": {
    "payment_history": [4500, 5000, 5500, 4800, 5200],
    "threshold": 5000,
    "history_commitment": [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    "employee_id": "alice.near"
  }
}'

# ============================================================================
# 4. Payment Proof
# ============================================================================

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  4/4: Payment Proof                                      ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

generate_proof "payment" '{
  "proof_type": "payment",
  "params": {
    "salary": 5000,
    "payment_amount": 5000,
    "salary_blinding": [17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17,17],
    "payment_blinding": [34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34,34],
    "employee_id": "alice.near"
  }
}'

# ============================================================================
# Summary
# ============================================================================

echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              Generation Complete!              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✓ All test proofs generated successfully!${NC}"
echo ""
echo "Generated proofs:"
for proof_file in "$TEST_PROOFS_DIR"/*.json; do
    if [ -f "$proof_file" ]; then
        filename=$(basename "$proof_file")
        size=$(wc -c < "$proof_file" | tr -d ' ')
        echo -e "  ${GREEN}✓${NC} $filename (${size} bytes)"
    fi
done
echo ""
echo "You can now run integration tests:"
echo -e "  ${YELLOW}cargo test -p zk-verifier --test integration_test${NC}"
echo ""
