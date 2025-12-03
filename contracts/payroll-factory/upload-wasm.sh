#!/bin/bash
set -e

# Upload payroll WASM to factory contract

FACTORY_ACCOUNT="payroll-factory.testnet"
OWNER_ACCOUNT="$1"
PAYROLL_WASM="../../target/near/payroll_contract/payroll_contract.wasm"

if [ -z "$OWNER_ACCOUNT" ]; then
    echo "Usage: ./upload-wasm.sh <owner-account>"
    echo ""
    echo "Example:"
    echo "  ./upload-wasm.sh your-account.testnet"
    exit 1
fi

if [ ! -f "$PAYROLL_WASM" ]; then
    echo "❌ Error: Payroll WASM not found at $PAYROLL_WASM"
    echo ""
    echo "Please build the payroll contract first:"
    echo "  cd ../payroll && cargo near build"
    exit 1
fi

# Get WASM size
WASM_SIZE=$(stat -f%z "$PAYROLL_WASM" 2>/dev/null || stat -c%s "$PAYROLL_WASM")
WASM_SIZE_KB=$((WASM_SIZE / 1024))

echo "📤 Uploading Payroll WASM to Factory"
echo "====================================="
echo "Factory: $FACTORY_ACCOUNT"
echo "Owner: $OWNER_ACCOUNT"
echo "WASM: $PAYROLL_WASM"
echo "Size: ${WASM_SIZE_KB} KB"
echo ""

# Convert WASM to base64 (split into chunks if needed)
echo "Encoding WASM to base64..."
WASM_BASE64=$(base64 -i "$PAYROLL_WASM")

# Create JSON args with base64 WASM
echo "Uploading to factory..."
near contract call-function as-transaction "$FACTORY_ACCOUNT" set_payroll_wasm \
    json-args "{\"wasm\":\"$WASM_BASE64\"}" \
    prepaid-gas '300.0 Tgas' \
    attached-deposit '0 NEAR' \
    sign-as "$OWNER_ACCOUNT" \
    network-config testnet \
    sign-with-keychain \
    send

echo ""
echo "✅ WASM uploaded successfully!"
echo ""
echo "Verifying factory is ready..."
near contract call-function as-read-only "$FACTORY_ACCOUNT" is_ready \
    json-args '{}' \
    network-config testnet \
    now

echo ""
echo "Factory stats:"
near contract call-function as-read-only "$FACTORY_ACCOUNT" get_stats \
    json-args '{}' \
    network-config testnet \
    now
