#!/bin/bash
set -e

# Intents Adapter deployment script for NEAR testnet

ADAPTER_ACCOUNT="intents-adapter.testnet"
OWNER_ACCOUNT="$1"
PAYROLL_FACTORY="${2:-payroll-factory.testnet}"
WZEC_TOKEN="${3:-wzec.testnet}"
INTENTS_CONTRACT="${4:-intents.near}" # Mainnet intents contract

if [ -z "$OWNER_ACCOUNT" ]; then
    echo "Usage: ./deploy.sh <owner-account> [payroll-factory] [wzec-token] [intents-contract]"
    echo ""
    echo "Example:"
    echo "  ./deploy.sh your-account.testnet"
    echo "  ./deploy.sh your-account.testnet payroll-factory.testnet wzec.testnet"
    echo ""
    echo "Note: Payroll factory address is needed since each company has their own payroll contract"
    exit 1
fi

echo "📦 Deploying NEAR Intents Adapter Contract"
echo "========================================"
echo "Adapter Account: $ADAPTER_ACCOUNT"
echo "Owner: $OWNER_ACCOUNT"
echo "Payroll Factory: $PAYROLL_FACTORY"
echo "wZEC Token: $WZEC_TOKEN"
echo "Intents Contract: $INTENTS_CONTRACT"
echo ""

# Check if adapter account exists
if near account view-account-summary "$ADAPTER_ACCOUNT" network-config testnet now 2>/dev/null; then
    echo "Adapter account already exists. Delete and redeploy? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        echo "Deleting existing adapter account..."
        near account delete-account "$ADAPTER_ACCOUNT" \
            beneficiary "$OWNER_ACCOUNT" \
            network-config testnet \
            sign-with-keychain \
            send
    else
        echo "Aborting deployment."
        exit 0
    fi
fi

echo "Creating adapter account..."
near account create-account fund-myself "$ADAPTER_ACCOUNT" '5 NEAR' \
    autogenerate-new-keypair \
    save-to-keychain \
    sign-as "$OWNER_ACCOUNT" \
    network-config testnet \
    sign-with-keychain \
    send

# Build contract first
echo ""
echo "Building contract..."
cd "$(dirname "$0")/../.."
cargo near build --manifest-path contracts/intents-adapter/Cargo.toml

# Deploy adapter contract
echo ""
echo "Deploying and initializing adapter contract..."
echo "Note: Using factory address as placeholder. Each company has their own payroll contract."

near contract deploy "$ADAPTER_ACCOUNT" \
    use-file target/near/intents_adapter/intents_adapter.wasm \
    with-init-call new \
    json-args "{\"owner\":\"$OWNER_ACCOUNT\",\"payroll_contract\":\"$PAYROLL_FACTORY\",\"wzec_token\":\"$WZEC_TOKEN\",\"intents_contract\":\"$INTENTS_CONTRACT\"}" \
    prepaid-gas '100.0 Tgas' \
    attached-deposit '0 NEAR' \
    network-config testnet \
    sign-with-keychain \
    send

echo ""
echo "✅ Adapter deployed successfully!"
echo ""
echo "Waiting for contract to be available..."
sleep 3

echo "Verifying deployment..."
MAX_RETRIES=5
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if near contract call-function as-read-only "$ADAPTER_ACCOUNT" get_stats \
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
echo "Adapter info:"
near contract call-function as-read-only "$ADAPTER_ACCOUNT" get_owner \
    json-args '{}' \
    network-config testnet \
    now

echo ""
near contract call-function as-read-only "$ADAPTER_ACCOUNT" get_intents_contract \
    json-args '{}' \
    network-config testnet \
    now

echo ""
echo "🎉 NEAR Intents Adapter is ready!"
echo ""
echo "Next steps:"
echo "1. Add bridge relayer as authorized:"
echo "   near contract call-function as-transaction $ADAPTER_ACCOUNT add_relayer \\"
echo "     json-args '{\"relayer\":\"RELAYER_ACCOUNT.testnet\"}' \\"
echo "     sign-as $OWNER_ACCOUNT \\"
echo "     network-config testnet send"
echo ""
echo "2. Frontend is configured with adapter address: $ADAPTER_ACCOUNT"
echo "3. Deposits now route: ZEC → NEAR Intents → wZEC → Adapter → Payroll"
echo ""
echo "Architecture:"
echo "  - Non-custodial: ZEC locked atomically on Zcash"
echo "  - Solver network provides wZEC on NEAR"
echo "  - Adapter routes to correct payroll contract"
echo "  - No trust needed, no custody"
