#!/bin/bash
set -e

# NEAR Private Payroll - Testnet Deployment Script
# Deploys all contracts and configures cross-chain intents integration
#
# Prerequisites:
# 1. NEAR CLI installed: npm install -g near-cli
# 2. Logged in to testnet: near login
# 3. Contracts built: ./scripts/build-all.sh
#
# Usage:
#   ./scripts/deploy-testnet.sh <owner-account-id>
#
# Example:
#   ./scripts/deploy-testnet.sh your-account.testnet

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print with color
print_info() {
    echo -e "${BLUE}ℹ ${NC}$1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_header() {
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
    echo ""
}

# Check arguments
if [ -z "$1" ]; then
    print_error "Missing owner account ID"
    echo "Usage: $0 <owner-account-id>"
    echo "Example: $0 your-account.testnet"
    exit 1
fi

OWNER_ACCOUNT=$1
NETWORK="testnet"

print_header "NEAR Private Payroll - Testnet Deployment"

print_info "Owner Account: $OWNER_ACCOUNT"
print_info "Network: $NETWORK"

# Verify account exists
print_info "Verifying owner account..."
if ! near state "$OWNER_ACCOUNT" --networkId "$NETWORK" &>/dev/null; then
    print_error "Account $OWNER_ACCOUNT not found on $NETWORK"
    exit 1
fi
print_success "Owner account verified"

# Check if contracts are built
CONTRACTS_DIR="./target/near"
WZEC_WASM="$CONTRACTS_DIR/wzec_token/wzec_token.wasm"
PAYROLL_WASM="$CONTRACTS_DIR/payroll_contract/payroll_contract.wasm"
INTENTS_WASM="$CONTRACTS_DIR/intents_adapter/intents_adapter.wasm"
VERIFIER_WASM="$CONTRACTS_DIR/zk_verifier/zk_verifier.wasm"

print_info "Checking contract WASMs..."
for wasm in "$WZEC_WASM" "$PAYROLL_WASM" "$INTENTS_WASM" "$VERIFIER_WASM"; do
    if [ ! -f "$wasm" ]; then
        print_error "Contract WASM not found: $wasm"
        print_info "Please run: ./scripts/build-all.sh"
        exit 1
    fi
done
print_success "All contract WASMs found"

# Generate unique subaccount names with timestamp
TIMESTAMP=$(date +%s)
WZEC_ACCOUNT="wzec-${TIMESTAMP}.${OWNER_ACCOUNT}"
VERIFIER_ACCOUNT="verifier-${TIMESTAMP}.${OWNER_ACCOUNT}"
PAYROLL_ACCOUNT="payroll-${TIMESTAMP}.${OWNER_ACCOUNT}"
INTENTS_ACCOUNT="intents-${TIMESTAMP}.${OWNER_ACCOUNT}"

# Deployment amounts (NEAR)
DEPLOY_DEPOSIT="15" # 15 NEAR for contract deployment + storage

print_header "Step 1: Deploy wZEC Token Contract"

print_info "Creating subaccount: $WZEC_ACCOUNT"
near create-account "$WZEC_ACCOUNT" --masterAccount "$OWNER_ACCOUNT" \
    --initialBalance "$DEPLOY_DEPOSIT" --networkId "$NETWORK"

print_info "Deploying wZEC contract..."
near deploy "$WZEC_ACCOUNT" "$WZEC_WASM" --networkId "$NETWORK"

print_info "Initializing wZEC token..."
near call "$WZEC_ACCOUNT" new \
    "{\"owner\": \"$OWNER_ACCOUNT\", \"bridge_controller\": \"$OWNER_ACCOUNT\"}" \
    --accountId "$OWNER_ACCOUNT" --networkId "$NETWORK"

print_success "wZEC token deployed at: $WZEC_ACCOUNT"

print_header "Step 2: Deploy ZK Verifier Contract"

print_info "Creating subaccount: $VERIFIER_ACCOUNT"
near create-account "$VERIFIER_ACCOUNT" --masterAccount "$OWNER_ACCOUNT" \
    --initialBalance "$DEPLOY_DEPOSIT" --networkId "$NETWORK"

print_info "Deploying verifier contract..."
near deploy "$VERIFIER_ACCOUNT" "$VERIFIER_WASM" --networkId "$NETWORK"

print_info "Initializing verifier..."
near call "$VERIFIER_ACCOUNT" new \
    "{\"owner\": \"$OWNER_ACCOUNT\"}" \
    --accountId "$OWNER_ACCOUNT" --networkId "$NETWORK"

print_success "ZK Verifier deployed at: $VERIFIER_ACCOUNT"

print_header "Step 3: Deploy Payroll Contract"

print_info "Creating subaccount: $PAYROLL_ACCOUNT"
near create-account "$PAYROLL_ACCOUNT" --masterAccount "$OWNER_ACCOUNT" \
    --initialBalance "$DEPLOY_DEPOSIT" --networkId "$NETWORK"

print_info "Deploying payroll contract..."
near deploy "$PAYROLL_ACCOUNT" "$PAYROLL_WASM" --networkId "$NETWORK"

print_info "Initializing payroll..."
near call "$PAYROLL_ACCOUNT" new \
    "{\"owner\": \"$OWNER_ACCOUNT\", \"wzec_token\": \"$WZEC_ACCOUNT\", \"zk_verifier\": \"$VERIFIER_ACCOUNT\"}" \
    --accountId "$OWNER_ACCOUNT" --networkId "$NETWORK"

print_success "Payroll deployed at: $PAYROLL_ACCOUNT"

print_header "Step 4: Deploy Intents Adapter Contract"

print_info "Creating subaccount: $INTENTS_ACCOUNT"
near create-account "$INTENTS_ACCOUNT" --masterAccount "$OWNER_ACCOUNT" \
    --initialBalance "$DEPLOY_DEPOSIT" --networkId "$NETWORK"

print_info "Deploying intents adapter..."
near deploy "$INTENTS_ACCOUNT" "$INTENTS_WASM" --networkId "$NETWORK"

print_info "Initializing intents adapter..."
# For testnet, we'll use owner as mock intents.near until real intents protocol is available
near call "$INTENTS_ACCOUNT" new \
    "{\"owner\": \"$OWNER_ACCOUNT\", \"payroll_contract\": \"$PAYROLL_ACCOUNT\", \"wzec_token\": \"$WZEC_ACCOUNT\", \"intents_contract\": \"$OWNER_ACCOUNT\"}" \
    --accountId "$OWNER_ACCOUNT" --networkId "$NETWORK"

print_success "Intents adapter deployed at: $INTENTS_ACCOUNT"

print_header "Step 5: Configure Contract Relationships"

print_info "Setting intents adapter in payroll contract..."
near call "$PAYROLL_ACCOUNT" set_intents_adapter \
    "{\"intents_adapter\": \"$INTENTS_ACCOUNT\"}" \
    --accountId "$OWNER_ACCOUNT" --networkId "$NETWORK"
print_success "Intents adapter configured in payroll"

print_info "Registering payroll contract with wZEC..."
near call "$WZEC_ACCOUNT" storage_deposit \
    "{\"account_id\": \"$PAYROLL_ACCOUNT\"}" \
    --accountId "$OWNER_ACCOUNT" --deposit 0.01 --networkId "$NETWORK"
print_success "Payroll registered with wZEC"

print_info "Registering intents adapter with wZEC..."
near call "$WZEC_ACCOUNT" storage_deposit \
    "{\"account_id\": \"$INTENTS_ACCOUNT\"}" \
    --accountId "$OWNER_ACCOUNT" --deposit 0.01 --networkId "$NETWORK"
print_success "Intents adapter registered with wZEC"

print_header "Step 6: Configure Cross-Chain Settings"

print_info "Updating Zcash testnet configuration..."
near call "$INTENTS_ACCOUNT" update_chain_config \
    "{\"config\": {
        \"chain\": \"Zcash\",
        \"deposit_enabled\": true,
        \"withdrawal_enabled\": true,
        \"min_withdrawal\": 1000000,
        \"max_withdrawal\": 0,
        \"fee_bps\": 50,
        \"bridge_address\": \"zcash-testnet-bridge.near\"
    }}" \
    --accountId "$OWNER_ACCOUNT" --networkId "$NETWORK"
print_success "Zcash testnet config updated"

print_info "Adding owner as authorized relayer (for testing)..."
near call "$INTENTS_ACCOUNT" add_relayer \
    "{\"relayer\": \"$OWNER_ACCOUNT\"}" \
    --accountId "$OWNER_ACCOUNT" --networkId "$NETWORK"
print_success "Relayer added"

print_header "Deployment Summary"

echo ""
print_success "All contracts deployed successfully!"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Contract Addresses (save these!):"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "  wZEC Token:        $WZEC_ACCOUNT"
echo "  ZK Verifier:       $VERIFIER_ACCOUNT"
echo "  Payroll:           $PAYROLL_ACCOUNT"
echo "  Intents Adapter:   $INTENTS_ACCOUNT"
echo ""
echo "  Owner:             $OWNER_ACCOUNT"
echo "  Network:           $NETWORK"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Save deployment info to file
DEPLOYMENT_FILE="deployment-${NETWORK}-${TIMESTAMP}.json"
cat > "$DEPLOYMENT_FILE" <<EOF
{
  "network": "$NETWORK",
  "timestamp": "$TIMESTAMP",
  "owner": "$OWNER_ACCOUNT",
  "contracts": {
    "wzec_token": "$WZEC_ACCOUNT",
    "zk_verifier": "$VERIFIER_ACCOUNT",
    "payroll": "$PAYROLL_ACCOUNT",
    "intents_adapter": "$INTENTS_ACCOUNT"
  },
  "configuration": {
    "bridge_controller": "$OWNER_ACCOUNT",
    "authorized_relayers": ["$OWNER_ACCOUNT"],
    "intents_contract": "$OWNER_ACCOUNT"
  }
}
EOF

print_success "Deployment info saved to: $DEPLOYMENT_FILE"

print_header "Next Steps"

echo "1. Test Deposit Flow:"
echo "   # Mint wZEC to test account (simulates bridge mint)"
echo "   near call $WZEC_ACCOUNT mint \\"
echo "     '{\"receiver_id\": \"your-company.testnet\", \"amount\": \"100000000\", \"zcash_tx_hash\": \"test_tx_123\"}' \\"
echo "     --accountId $OWNER_ACCOUNT --deposit 0.01 --networkId $NETWORK"
echo ""
echo "   # Company deposits to payroll"
echo "   near call $WZEC_ACCOUNT ft_transfer_call \\"
echo "     '{\"receiver_id\": \"$INTENTS_ACCOUNT\", \"amount\": \"100000000\", \"msg\": \"deposit:your-company.testnet:zcash:test_tx\"}' \\"
echo "     --accountId your-company.testnet --depositYocto 1 --gas 300000000000000 --networkId $NETWORK"
echo ""
echo "2. Add Employee:"
echo "   # Use SDK or near call $PAYROLL_ACCOUNT add_employee ..."
echo ""
echo "3. Test Withdrawal:"
echo "   # Employee withdraws to Zcash testnet"
echo "   near call $PAYROLL_ACCOUNT withdraw_via_intents \\"
echo "     '{\"amount\": \"50000000\", \"destination_chain\": \"Zcash\", \"destination_address\": \"tmXXX...\"}' \\"
echo "     --accountId employee.testnet --gas 300000000000000 --networkId $NETWORK"
echo ""
echo "4. Monitor Logs:"
echo "   near tx-status <transaction-hash> --accountId $OWNER_ACCOUNT --networkId $NETWORK"
echo ""

print_warning "Note: For real Zcash integration, you'll need to:"
print_warning "  - Deploy an actual bridge relayer service"
print_warning "  - Connect to Zcash testnet (https://zcash.readthedocs.io/en/latest/rtd_pages/testnet_guide.html)"
print_warning "  - Configure real bridge addresses instead of mock accounts"

echo ""
print_success "Deployment complete! 🎉"
echo ""
