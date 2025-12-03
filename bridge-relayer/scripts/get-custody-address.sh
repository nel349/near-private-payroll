#!/bin/bash
# Get custody address from Zallet for deposits

RPC_USER="${ZCASH_RPC_USER:-zcashrpc}"
RPC_PASSWORD="${ZCASH_RPC_PASSWORD:-testpass123}"
RPC_HOST="${ZCASH_RPC_HOST:-127.0.0.1}"
RPC_PORT="${ZCASH_RPC_PORT:-28232}"

# Get first account UUID
UUID=$(curl -s --user "$RPC_USER:$RPC_PASSWORD" \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_listaccounts","params":[]}' \
  http://$RPC_HOST:$RPC_PORT/ | jq -r '.result[0].account_uuid')

if [ -z "$UUID" ] || [ "$UUID" = "null" ]; then
  echo "Error: No accounts found. Make sure Zallet is running."
  exit 1
fi

# Get Sapling address for this account
CUSTODY_ADDR=$(curl -s --user "$RPC_USER:$RPC_PASSWORD" \
  --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"1\",\"method\":\"z_getaddressforaccount\",\"params\":[\"$UUID\",[\"sapling\"]]}" \
  http://$RPC_HOST:$RPC_PORT/ | jq -r '.result.address')

if [ -z "$CUSTODY_ADDR" ] || [ "$CUSTODY_ADDR" = "null" ]; then
  echo "Error: Could not get custody address"
  exit 1
fi

echo "Custody Address: $CUSTODY_ADDR"
echo "Account UUID: $UUID"
echo ""
echo "To deposit for testing, send ZEC to this address with memo:"
echo "  company:<your-near-account>.testnet"
echo ""
echo "Example:"
echo "  zcash-cli z_sendmany \"<your-address>\" '[{\"address\":\"$CUSTODY_ADDR\",\"amount\":0.01,\"memo\":\"$(echo -n 'company:your-account.testnet' | xxd -p | tr -d '\\n')\"}]'"
