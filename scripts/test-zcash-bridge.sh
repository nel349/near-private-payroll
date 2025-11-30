#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Zcash Testnet → NEAR Testnet Bridge Testing Script         ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "Cargo.toml" ]; then
    echo -e "${RED}❌ Error: Run this from the project root directory${NC}"
    exit 1
fi

# Step 1: Check Zcash
echo -e "${YELLOW}Step 1: Checking Zcash testnet connection...${NC}"

if command -v zcash-cli &> /dev/null; then
    echo "  ✓ zcash-cli found"

    if zcash-cli -testnet getblockchaininfo &> /dev/null; then
        echo -e "  ${GREEN}✓ Connected to Zcash testnet${NC}"
        BLOCK_HEIGHT=$(zcash-cli -testnet getblockcount)
        echo "    Block height: $BLOCK_HEIGHT"
    else
        echo -e "  ${RED}✗ Zcash node not running${NC}"
        echo ""
        echo "Start Zcash testnet node:"
        echo "  docker run -d --name zcash-testnet -p 18232:18232 electriccoinco/zcashd:latest zcashd -testnet"
        echo "  OR"
        echo "  zcashd -testnet -daemon"
        exit 1
    fi
else
    echo -e "  ${RED}✗ zcash-cli not installed${NC}"
    echo ""
    echo "Install Zcash:"
    echo "  macOS: brew install zcash"
    echo "  Docker: See docs/ZCASH_TESTNET_SETUP.md"
    exit 1
fi

# Step 2: Check NEAR
echo ""
echo -e "${YELLOW}Step 2: Checking NEAR testnet connection...${NC}"

if command -v near &> /dev/null; then
    echo "  ✓ near-cli found"

    # Check for credentials
    if [ -d "$HOME/.near-credentials/testnet" ]; then
        echo -e "  ${GREEN}✓ NEAR testnet credentials found${NC}"

        # Try to get first account
        NEAR_ACCOUNT=$(ls "$HOME/.near-credentials/testnet" | head -1 | sed 's/.json//')
        echo "    Account: $NEAR_ACCOUNT"
    else
        echo -e "  ${RED}✗ No NEAR testnet credentials${NC}"
        echo ""
        echo "Login to NEAR:"
        echo "  near login"
        exit 1
    fi
else
    echo -e "  ${RED}✗ near-cli not installed${NC}"
    echo ""
    echo "Install NEAR CLI:"
    echo "  npm install -g near-cli"
    exit 1
fi

# Step 3: Setup custody address
echo ""
echo -e "${YELLOW}Step 3: Setting up bridge custody address...${NC}"

BRIDGE_STATE_FILE="$HOME/.zcash-near-bridge-state"

if [ -f "$BRIDGE_STATE_FILE" ]; then
    echo "  ℹ Loading existing custody address..."
    source "$BRIDGE_STATE_FILE"
    echo "    Custody: $CUSTODY_ADDRESS"
else
    echo "  ℹ Creating new custody address..."
    CUSTODY_ADDRESS=$(zcash-cli -testnet z_getnewaddress sapling 2>/dev/null || echo "")

    if [ -z "$CUSTODY_ADDRESS" ]; then
        echo -e "  ${RED}✗ Failed to create custody address${NC}"
        exit 1
    fi

    echo "export CUSTODY_ADDRESS='$CUSTODY_ADDRESS'" > "$BRIDGE_STATE_FILE"
    echo -e "  ${GREEN}✓ Created custody address: $CUSTODY_ADDRESS${NC}"
    echo ""
    echo -e "${YELLOW}  ⚠️  IMPORTANT: Get testnet ZEC for this address!${NC}"
    echo "    1. Visit: https://faucet.testnet.z.cash/"
    echo "    2. Enter address: $CUSTODY_ADDRESS"
    echo "    3. Wait for confirmation"
fi

# Check custody balance
CUSTODY_BALANCE=$(zcash-cli -testnet z_getbalance "$CUSTODY_ADDRESS" 2>/dev/null || echo "0")
echo "  Balance: $CUSTODY_BALANCE ZEC"

if [ "$CUSTODY_BALANCE" == "0" ] || [ "$CUSTODY_BALANCE" == "0.00000000" ]; then
    echo ""
    echo -e "${YELLOW}  ⚠️  Custody address has no funds!${NC}"
    echo "    Get testnet ZEC:"
    echo "    1. Visit: https://faucet.testnet.z.cash/"
    echo "    2. Enter: $CUSTODY_ADDRESS"
    echo "    3. Run this script again"
    echo ""
    read -p "Press Enter to continue anyway or Ctrl+C to exit..."
fi

# Step 4: Check if contracts are deployed
echo ""
echo -e "${YELLOW}Step 4: Checking for deployed contracts...${NC}"

DEPLOYMENT_FILE=$(ls deployment-testnet-*.json 2>/dev/null | tail -1)

if [ -n "$DEPLOYMENT_FILE" ]; then
    echo "  ✓ Found deployment: $DEPLOYMENT_FILE"

    WZEC_CONTRACT=$(jq -r '.wzec_token' "$DEPLOYMENT_FILE")
    INTENTS_ADAPTER=$(jq -r '.intents_adapter' "$DEPLOYMENT_FILE")
    PAYROLL_CONTRACT=$(jq -r '.payroll' "$DEPLOYMENT_FILE")
    OWNER=$(jq -r '.owner' "$DEPLOYMENT_FILE")

    echo "    wZEC: $WZEC_CONTRACT"
    echo "    Intents: $INTENTS_ADAPTER"
    echo "    Payroll: $PAYROLL_CONTRACT"
    echo "    Owner: $OWNER"
else
    echo -e "  ${RED}✗ No deployment found${NC}"
    echo ""
    echo "Deploy contracts first:"
    echo "  ./scripts/deploy-testnet.sh $NEAR_ACCOUNT"
    exit 1
fi

# Step 5: Setup bridge relayer
echo ""
echo -e "${YELLOW}Step 5: Setting up bridge relayer...${NC}"

cd bridge-relayer

if [ ! -d "node_modules" ]; then
    echo "  Installing dependencies..."
    npm install --silent
fi

# Create .env if it doesn't exist
if [ ! -f ".env" ]; then
    echo "  Creating .env configuration..."

    # Get Zcash RPC password
    ZCASH_CONF="$HOME/.zcash/zcash.conf"
    if [ -f "$ZCASH_CONF" ]; then
        ZCASH_RPC_PASSWORD=$(grep "^rpcpassword=" "$ZCASH_CONF" | cut -d= -f2)
    else
        ZCASH_RPC_PASSWORD="your_password_here"
    fi

    cat > .env <<EOF
# Zcash Configuration
ZCASH_RPC_HOST=127.0.0.1
ZCASH_RPC_PORT=18232
ZCASH_RPC_USER=zcashrpc
ZCASH_RPC_PASSWORD=$ZCASH_RPC_PASSWORD
ZCASH_CUSTODY_ADDRESS=$CUSTODY_ADDRESS

# NEAR Configuration
NEAR_NETWORK=testnet
NEAR_RELAYER_ACCOUNT=$OWNER
WZEC_CONTRACT=$WZEC_CONTRACT
INTENTS_ADAPTER=$INTENTS_ADAPTER

# Polling interval in milliseconds
POLL_INTERVAL=30000
EOF

    echo -e "  ${GREEN}✓ Created .env configuration${NC}"
fi

cd ..

# Step 6: Instructions
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Setup Complete! Ready to test the bridge.                  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo ""
echo "1. Start the bridge relayer:"
echo -e "   ${YELLOW}cd bridge-relayer && npm start${NC}"
echo ""
echo "2. In another terminal, send a test deposit:"
echo -e "   ${YELLOW}zcash-cli -testnet z_sendmany \\${NC}"
echo -e "   ${YELLOW}  \"<your_funded_address>\" \\${NC}"
echo -e "   ${YELLOW}  '[{${NC}"
echo -e "   ${YELLOW}    \"address\": \"$CUSTODY_ADDRESS\",${NC}"
echo -e "   ${YELLOW}    \"amount\": 0.01,${NC}"
echo -e "   ${YELLOW}    \"memo\": \"'$(echo -n "company:$OWNER" | xxd -p)'\"${NC}"
echo -e "   ${YELLOW}  }]'${NC}"
echo ""
echo "3. Watch the relayer detect the deposit and mint wZEC on NEAR"
echo ""
echo "4. Verify wZEC was minted:"
echo -e "   ${YELLOW}near view $WZEC_CONTRACT ft_balance_of \\${NC}"
echo -e "   ${YELLOW}  '{\"account_id\": \"$OWNER\"}' \\${NC}"
echo -e "   ${YELLOW}  --networkId testnet${NC}"
echo ""
echo -e "${BLUE}Resources:${NC}"
echo "  • Zcash Testnet Guide: docs/ZCASH_TESTNET_SETUP.md"
echo "  • Bridge Relayer README: bridge-relayer/README.md"
echo "  • Manual Testing Guide: docs/INTENTS_MANUAL_TESTING.md"
echo ""
echo -e "${BLUE}Testnet Explorers:${NC}"
echo "  • Zcash: https://explorer.testnet.z.cash/"
echo "  • NEAR: https://testnet.nearblocks.io/"
echo ""
