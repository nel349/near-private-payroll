#!/bin/bash

# Zallet RPC Command Testing Script
# Tests all available Zallet RPC methods

set -e

RPC_USER="zcashrpc"
RPC_PASS="testpass123"
RPC_URL="http://127.0.0.1:28232/"

echo "========================================="
echo "  Zallet RPC Command Test Suite"
echo "========================================="
echo ""

# Helper function for RPC calls
rpc_call() {
    local method="$1"
    local params="$2"

    curl -s --user "$RPC_USER:$RPC_PASS" \
        --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"test\",\"method\":\"$method\",\"params\":$params}" \
        -H 'content-type: text/plain;' \
        "$RPC_URL"
}

# Test 1: List Accounts
echo "1. z_listaccounts - List all wallet accounts"
echo "================================================"
RESULT=$(rpc_call "z_listaccounts" "[]")
echo "$RESULT" | jq '.'
ACCOUNT_UUID=$(echo "$RESULT" | jq -r '.result[0].account_uuid // empty')
echo ""
echo "Account UUID: $ACCOUNT_UUID"
echo ""

if [ -z "$ACCOUNT_UUID" ]; then
    echo "❌ No accounts found. Cannot continue tests."
    exit 1
fi

# Test 2: Get Address for Account
echo ""
echo "2. z_getaddressforaccount - Get unified address"
echo "================================================"
rpc_call "z_getaddressforaccount" "[\"$ACCOUNT_UUID\"]" | jq '.'
echo ""

# Test 3: Get Sapling Address
echo ""
echo "3. z_getaddressforaccount (sapling) - Get shielded address"
echo "==========================================================="
SAPLING_RESULT=$(rpc_call "z_getaddressforaccount" "[\"$ACCOUNT_UUID\",[\"sapling\"]]")
echo "$SAPLING_RESULT" | jq '.'
SAPLING_ADDR=$(echo "$SAPLING_RESULT" | jq -r '.result.address // empty')
echo ""
echo "Sapling Address: $SAPLING_ADDR"
echo ""

# Test 4: List All Addresses
echo ""
echo "4. listaddresses - List all wallet addresses"
echo "============================================="
rpc_call "listaddresses" "[]" | jq '.'
echo ""

# Test 5: Get Balance for Account
echo ""
echo "5. z_getbalanceforaccount - Check account balance"
echo "=================================================="
rpc_call "z_getbalanceforaccount" "[\"$ACCOUNT_UUID\"]" | jq '.'
echo ""

# Test 6: Get Total Wallet Balance
echo ""
echo "6. getbalance - Get total wallet balance"
echo "========================================="
rpc_call "getbalance" "[]" | jq '.'
echo ""

# Test 7: List Unspent Outputs
echo ""
echo "7. z_listunspent - List unspent transaction outputs"
echo "===================================================="
rpc_call "z_listunspent" "[]" | jq '.'
echo ""

# Test 8: Get Blockchain Info (via Zebra)
echo ""
echo "8. getblockchaininfo - Get blockchain sync status"
echo "=================================================="
rpc_call "getblockchaininfo" "[]" | jq '.result | {chain, blocks, verificationprogress}'
echo ""

# Test 9: Validate Address
echo ""
echo "9. z_validateaddress - Validate a Zcash address"
echo "================================================"
if [ -n "$SAPLING_ADDR" ]; then
    rpc_call "z_validateaddress" "[\"$SAPLING_ADDR\"]" | jq '.'
else
    echo "Skipped - no address available"
fi
echo ""

# Test 10: Get Network Info
echo ""
echo "10. getnetworkinfo - Get network information"
echo "============================================="
rpc_call "getnetworkinfo" "[]" | jq '.'
echo ""

echo "========================================="
echo "  Test Suite Complete!"
echo "========================================="
echo ""
echo "📝 Summary:"
echo "   Account UUID: $ACCOUNT_UUID"
echo "   Sapling Address: $SAPLING_ADDR"
echo ""
echo "💡 Next steps:"
echo "   1. Get testnet ZEC from faucet using your sapling address"
echo "   2. Use z_sendmany to send transactions"
echo "   3. Monitor with z_listunspent"
