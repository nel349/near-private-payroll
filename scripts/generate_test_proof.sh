#!/bin/bash
# Generate a test proof using the proof server
# Usage: ./scripts/generate_test_proof.sh [proof_type] [output_file]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
PROOF_TYPE="${1:-income_threshold}"
OUTPUT_FILE="${2:-./scripts/test_proofs/${PROOF_TYPE}.json}"
PROOF_SERVER_URL="${PROOF_SERVER_URL:-http://localhost:3000}"

# Get to project root
cd "$(dirname "$0")/.."

echo -e "${BLUE}=== RISC Zero Proof Generator ===${NC}"
echo -e "Proof type: ${GREEN}${PROOF_TYPE}${NC}"
echo -e "Output file: ${GREEN}${OUTPUT_FILE}${NC}"
echo ""

# Check if proof server is running
echo -e "${YELLOW}Checking proof server...${NC}"
if ! curl -s "${PROOF_SERVER_URL}/health" > /dev/null 2>&1; then
    echo -e "${RED}Error: Proof server not running at ${PROOF_SERVER_URL}${NC}"
    echo -e "${YELLOW}Start the server with:${NC}"
    echo -e "  ELF_DIR=\"\$PWD/target/riscv32im-risc0-zkvm-elf/docker\" cargo run -p proof-server --release"
    exit 1
fi

echo -e "${GREEN}✓ Proof server is running${NC}"
echo ""

# Create output directory if it doesn't exist
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Generate proof based on type
echo -e "${YELLOW}Generating ${PROOF_TYPE} proof...${NC}"

case "$PROOF_TYPE" in
    income_threshold)
        PAYLOAD='{
            "proof_type": "income_threshold",
            "params": {
                "payment_history": [5000, 5000, 5200],
                "threshold": 4000,
                "history_commitment": [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                "employee_id": "alice.near"
            }
        }'
        ;;

    income_range)
        PAYLOAD='{
            "proof_type": "income_range",
            "params": {
                "payment_history": [5000, 5000, 5200],
                "min_amount": 4000,
                "max_amount": 6000,
                "history_commitment": [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                "employee_id": "alice.near"
            }
        }'
        ;;

    average_income)
        PAYLOAD='{
            "proof_type": "average_income",
            "params": {
                "payment_history": [5000, 5000, 5200],
                "threshold": 5000,
                "history_commitment": [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                "employee_id": "alice.near"
            }
        }'
        ;;

    credit_score)
        PAYLOAD='{
            "proof_type": "credit_score",
            "params": {
                "payment_history": [5000, 5000, 5200],
                "threshold": 700,
                "history_commitment": [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
                "employee_id": "alice.near"
            }
        }'
        ;;

    *)
        echo -e "${RED}Error: Unknown proof type '$PROOF_TYPE'${NC}"
        echo -e "Supported types: income_threshold, income_range, average_income, credit_score"
        exit 1
        ;;
esac

# Send request and wait for response
echo -e "${BLUE}Sending request to proof server...${NC}"
echo -e "${YELLOW}This will take ~1-2 minutes (STARK + Groth16 conversion)...${NC}"
echo ""

RESPONSE=$(curl -s -X POST "${PROOF_SERVER_URL}/api/v1/proof/generate" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

# Check if request was successful
if echo "$RESPONSE" | jq -e '.receipt' > /dev/null 2>&1; then
    # Save to file
    echo "$RESPONSE" | jq '.' > "$OUTPUT_FILE"

    # Extract info
    RECEIPT_SIZE=$(echo "$RESPONSE" | jq '.receipt | length')
    GEN_TIME=$(echo "$RESPONSE" | jq '.generation_time_ms')
    IMAGE_ID=$(echo "$RESPONSE" | jq -r '.image_id | map(tostring) | join(",")' | head -c 64)

    echo -e "${GREEN}✓ Proof generated successfully!${NC}"
    echo ""
    echo -e "${BLUE}=== Receipt Details ===${NC}"
    echo -e "Receipt size: ${GREEN}${RECEIPT_SIZE} bytes${NC}"
    echo -e "Generation time: ${GREEN}${GEN_TIME} ms${NC} (~$((GEN_TIME/1000)) seconds)"
    echo -e "Image ID: ${GREEN}${IMAGE_ID}...${NC}"
    echo -e "Saved to: ${GREEN}${OUTPUT_FILE}${NC}"
    echo ""

    # Extract public inputs
    echo -e "${BLUE}=== Public Inputs ===${NC}"
    echo "$RESPONSE" | jq '.public_inputs'
    echo ""

    # Show receipt structure
    echo -e "${BLUE}=== Receipt Structure ===${NC}"
    echo -e "Format: image_id (32) + claim_digest (32) + seal (256) + journal"
    SEAL_OFFSET=64
    SEAL_END=$((SEAL_OFFSET + 256))
    echo -e "Seal bytes ${SEAL_OFFSET}-${SEAL_END}: A (64) + B (128) + C (64)"
    echo -e "  - Point A (G1): bytes 64-127"
    echo -e "  - Point B (G2): bytes 128-255 ${GREEN}[x_c0||x_c1||y_c0||y_c1]${NC}"
    echo -e "  - Point C (G1): bytes 256-319"
    echo ""

    echo -e "${GREEN}✓ Done!${NC}"

else
    echo -e "${RED}✗ Proof generation failed${NC}"
    echo ""
    echo -e "${YELLOW}Response:${NC}"
    echo "$RESPONSE" | jq '.' || echo "$RESPONSE"
    exit 1
fi
