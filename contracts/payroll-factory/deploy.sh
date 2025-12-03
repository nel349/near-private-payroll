#!/bin/bash
set -e

# Factory deployment script for NEAR testnet

FACTORY_ACCOUNT="payroll-factory.testnet"
OWNER_ACCOUNT="$1"
WZEC_TOKEN="${2:-wzec.testnet}"
ZK_VERIFIER="${3:-verifier.testnet}"

if [ -z "$OWNER_ACCOUNT" ]; then
    echo "Usage: ./deploy.sh <owner-account> [wzec-token] [zk-verifier]"
    echo ""
    echo "Example:"
    echo "  ./deploy.sh your-account.testnet"
    echo "  ./deploy.sh your-account.testnet wzec.testnet verifier.testnet"
    exit 1
fi

echo "📦 Deploying Payroll Factory Contract"
echo "======================================"
echo "Factory Account: $FACTORY_ACCOUNT"
echo "Owner: $OWNER_ACCOUNT"
echo "wZEC Token: $WZEC_TOKEN"
echo "ZK Verifier: $ZK_VERIFIER"
echo ""

# Check if factory account exists
if near account view-account-summary "$FACTORY_ACCOUNT" network-config testnet now 2>/dev/null; then
    echo "Factory account already exists. Delete and redeploy? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo "Deleting existing factory account..."
        near account delete-account "$FACTORY_ACCOUNT" \
            beneficiary "$OWNER_ACCOUNT" \
            network-config testnet \
            sign-with-keychain \
            send
    else
        echo "Aborting deployment."
        exit 0
    fi
fi

echo "Creating factory account..."
near account create-account fund-myself "$FACTORY_ACCOUNT" '10 NEAR' \
    autogenerate-new-keypair \
    save-to-keychain \
    sign-as "$OWNER_ACCOUNT" \
    network-config testnet \
    sign-with-keychain \
    send

# Deploy factory contract
echo ""
echo "Deploying and initializing factory contract..."
near contract deploy "$FACTORY_ACCOUNT" \
    use-file ../../target/near/payroll_factory/payroll_factory.wasm \
    with-init-call new \
    json-args "{\"owner\":\"$OWNER_ACCOUNT\",\"wzec_token\":\"$WZEC_TOKEN\",\"zk_verifier\":\"$ZK_VERIFIER\"}" \
    prepaid-gas '100.0 Tgas' \
    attached-deposit '0 NEAR' \
    network-config testnet \
    sign-with-keychain \
    send

echo ""
echo "✅ Factory deployed successfully!"
echo ""
echo "Waiting for contract to be available..."
sleep 3

echo "Verifying factory is ready..."
MAX_RETRIES=5
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if near contract call-function as-read-only "$FACTORY_ACCOUNT" is_ready \
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
echo "Factory stats:"
near contract call-function as-read-only "$FACTORY_ACCOUNT" get_stats \
    json-args '{}' \
    network-config testnet \
    now

echo ""
echo "🎉 Factory is ready to deploy payroll contracts!"
echo ""
echo "Next steps:"
echo "1. Frontend is already configured with factory address: $FACTORY_ACCOUNT"
echo "2. Test company creation from the UI"
