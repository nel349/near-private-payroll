#!/bin/bash
set -e

# wZEC Token deployment script for NEAR testnet

WZEC_ACCOUNT="wzec.testnet"
OWNER_ACCOUNT="$1"
BRIDGE_CONTROLLER="${2:-$OWNER_ACCOUNT}"

if [ -z "$OWNER_ACCOUNT" ]; then
    echo "Usage: ./deploy.sh <owner-account> [bridge-controller]"
    echo ""
    echo "Example:"
    echo "  ./deploy.sh your-account.testnet"
    echo "  ./deploy.sh your-account.testnet bridge-relayer.testnet"
    echo ""
    echo "Arguments:"
    echo "  owner-account      - Account that owns the contract and can update settings"
    echo "  bridge-controller  - Account that can mint/burn tokens (defaults to owner)"
    exit 1
fi

echo "📦 Deploying wZEC Token Contract"
echo "========================================"
echo "Token Account: $WZEC_ACCOUNT"
echo "Owner: $OWNER_ACCOUNT"
echo "Bridge Controller: $BRIDGE_CONTROLLER"
echo ""

# Check if wZEC account exists
if near account view-account-summary "$WZEC_ACCOUNT" network-config testnet now 2>/dev/null; then
    echo "wZEC account already exists. Delete and redeploy? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo "Deleting existing wZEC account..."
        near account delete-account "$WZEC_ACCOUNT" \
            beneficiary "$OWNER_ACCOUNT" \
            network-config testnet \
            sign-with-keychain \
            send
    else
        echo "Aborting deployment."
        exit 0
    fi
fi

echo "Creating wZEC token account..."
near account create-account fund-myself "$WZEC_ACCOUNT" '5 NEAR' \
    autogenerate-new-keypair \
    save-to-keychain \
    sign-as "$OWNER_ACCOUNT" \
    network-config testnet \
    sign-with-keychain \
    send

# Deploy wZEC token contract
echo ""
echo "Deploying and initializing wZEC token contract..."
near contract deploy "$WZEC_ACCOUNT" \
    use-file ../../target/near/wzec_token/wzec_token.wasm \
    with-init-call new \
    json-args "{\"owner\":\"$OWNER_ACCOUNT\",\"bridge_controller\":\"$BRIDGE_CONTROLLER\"}" \
    prepaid-gas '100.0 Tgas' \
    attached-deposit '0 NEAR' \
    network-config testnet \
    sign-with-keychain \
    send

echo ""
echo "✅ wZEC token deployed successfully!"
echo ""
echo "Waiting for contract to be available..."
sleep 3

echo "Verifying deployment..."
MAX_RETRIES=5
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if near contract call-function as-read-only "$WZEC_ACCOUNT" ft_metadata \
        json-args '{}' \
        network-config testnet \
        now 2>/dev/null; then
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        echo "Contract not ready yet, retrying in 2 seconds... ($RETRY_COUNT/$MAX_RETRIES)"
        sleep 2
    fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Failed to verify contract after $MAX_RETRIES attempts"
    exit 1
fi

echo ""
echo "Token info:"
near contract call-function as-read-only "$WZEC_ACCOUNT" get_owner \
    json-args '{}' \
    network-config testnet \
    now

echo ""
near contract call-function as-read-only "$WZEC_ACCOUNT" get_bridge_controller \
    json-args '{}' \
    network-config testnet \
    now

echo ""
near contract call-function as-read-only "$WZEC_ACCOUNT" get_total_locked_zec \
    json-args '{}' \
    network-config testnet \
    now

echo ""
echo "🎉 wZEC token is ready!"
echo ""
echo "Next steps:"
echo "1. Token address: $WZEC_ACCOUNT"
echo "2. Frontend is already configured with this address"
echo "3. To mint test tokens for development:"
echo "   near contract call-function as-transaction $WZEC_ACCOUNT mint \\"
echo "     json-args '{\"receiver_id\":\"YOUR_ACCOUNT.testnet\",\"amount\":\"1000000000\",\"zcash_tx_hash\":\"test-tx-123\"}' \\"
echo "     prepaid-gas '100.0 Tgas' \\"
echo "     attached-deposit '1 yoctoNEAR' \\"
echo "     sign-as $BRIDGE_CONTROLLER \\"
echo "     network-config testnet \\"
echo "     send"
echo ""
echo "4. Users must register for storage before receiving tokens:"
echo "   near contract call-function as-transaction $WZEC_ACCOUNT storage_deposit \\"
echo "     json-args '{}' \\"
echo "     prepaid-gas '100.0 Tgas' \\"
echo "     attached-deposit '0.00125 NEAR' \\"
echo "     sign-as YOUR_ACCOUNT.testnet \\"
echo "     network-config testnet \\"
echo "     send"
