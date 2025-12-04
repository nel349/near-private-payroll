#!/bin/bash
set -e

# Delete a company contract and recover NEAR
# Usage: ./delete-company.sh <company-name>

COMPANY_NAME="$1"
BENEFICIARY="${2:-nel349.testnet}"

if [ -z "$COMPANY_NAME" ]; then
    echo "Usage: ./delete-company.sh <company-name> [beneficiary]"
    echo ""
    echo "Example:"
    echo "  ./delete-company.sh alibaba-1764820601316"
    echo "  ./delete-company.sh test-123 nel349.testnet"
    exit 1
fi

# Full contract ID
CONTRACT_ID="${COMPANY_NAME}.payroll-factory.testnet"

echo "🗑️  Deleting company contract"
echo "=============================="
echo "Contract: $CONTRACT_ID"
echo "Beneficiary: $BENEFICIARY"
echo ""

# Copy credentials
echo "Setting up credentials..."
cp ~/.near-credentials/testnet/blackvilla9575.testnet.json \
   ~/.near-credentials/testnet/${CONTRACT_ID}.json

# Delete contract
echo ""
echo "Deleting contract and transferring NEAR..."
near account delete-account "$CONTRACT_ID" \
  beneficiary "$BENEFICIARY" \
  network-config testnet \
  sign-with-legacy-keychain \
  send

echo ""
echo "✅ Done! NEAR transferred to $BENEFICIARY"
