#!/bin/bash
# Generate image_ids.json from circuit ELF binaries
# This script runs the Rust test to compute image IDs and extracts them to JSON

set -e

echo "Generating image IDs from circuit ELF binaries..."
echo ""

# Run the compute_image_ids test and capture output
OUTPUT=$(cargo test -p proof-server --test compute_image_ids -- --nocapture 2>&1)

# Extract image IDs from the output using grep and awk
INCOME_IMAGE_ID=$(echo "$OUTPUT" | grep -A 2 "=== income-proof ===" | grep "Image ID (bytes):" | awk -F': ' '{print $2}')
PAYMENT_IMAGE_ID=$(echo "$OUTPUT" | grep -A 2 "=== payment-proof ===" | grep "Image ID (bytes):" | awk -F': ' '{print $2}')
BALANCE_IMAGE_ID=$(echo "$OUTPUT" | grep -A 2 "=== balance-proof ===" | grep "Image ID (bytes):" | awk -F': ' '{print $2}')

# Check if we successfully extracted image IDs
if [[ -z "$INCOME_IMAGE_ID" || -z "$PAYMENT_IMAGE_ID" || -z "$BALANCE_IMAGE_ID" ]]; then
    echo "Error: Failed to extract image IDs from test output"
    echo "Make sure circuits are built: ./scripts/build-circuits.sh"
    exit 1
fi

# Create image_ids.json
cat > scripts/image_ids.json <<EOF
{
  "income_threshold": $INCOME_IMAGE_ID,
  "income_range": $INCOME_IMAGE_ID,
  "credit_score": $INCOME_IMAGE_ID,
  "payment": $PAYMENT_IMAGE_ID,
  "balance": $BALANCE_IMAGE_ID
}
EOF

echo "✓ Generated scripts/image_ids.json"
echo ""
echo "Image IDs:"
echo "  income-proof:  $(echo "$OUTPUT" | grep -A 2 "=== income-proof ===" | grep "Image ID (hex)" | awk -F': ' '{print $2}' | cut -c1-16)..."
echo "  payment-proof: $(echo "$OUTPUT" | grep -A 2 "=== payment-proof ===" | grep "Image ID (hex)" | awk -F': ' '{print $2}' | cut -c1-16)..."
echo "  balance-proof: $(echo "$OUTPUT" | grep -A 2 "=== balance-proof ===" | grep "Image ID (hex)" | awk -F': ' '{print $2}' | cut -c1-16)..."
echo ""
echo "Note: income_threshold, income_range, and credit_score all use the same income-proof circuit"
