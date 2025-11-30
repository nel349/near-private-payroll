# Zcash Command Reference - Quick Guide

**Last Updated:** 2025-11-30
**Tools:** Zebra + Zallet
**Your Setup:** Zebra at 55% sync, Zallet connected

---

## Current Status

```bash
# Check Zebra sync
docker logs zebra-testnet 2>&1 | grep "sync_percent" | tail -1

# Check Zallet is running
ps aux | grep zallet | grep -v grep

# Check Zallet logs
tail -f /tmp/zallet.log
```

**Zebra:** ✅ Running at 127.0.0.1:18232 (55% synced)
**Zallet:** ✅ Running and syncing with Zebra
**RPC:** ⏳ Will be available once Zallet finishes initial sync

---

## Zebra Commands (Working Now)

Zebra RPC is fully functional. Use with cookie auth:

```bash
# Get cookie
COOKIE=$(docker exec zebra-testnet cat /home/zebra/.cache/zebra/.cookie)

# Helper function
zebra_rpc() {
    curl -s --user "$COOKIE" \
        --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"test\",\"method\":\"$1\",\"params\":$2}" \
        http://127.0.0.1:18232/
}
```

### 1. Get Blockchain Info
```bash
curl -s --user '__cookie__:2QziVuhOIpnYnrBumcRYyb2HqCkOM7QV6qzxUpPmFCc=' \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"getblockchaininfo","params":[]}' \
  http://127.0.0.1:18232/ | jq '.result | {chain, blocks, verificationprogress}'
```

**Output:**
```json
{
  "chain": "test",
  "blocks": 1871600,
  "verificationprogress": 0.555
}
```

### 2. Get Network Info
```bash
curl -s --user '__cookie__:2QziVuhOIpnYnrBumcRYyb2HqCkOM7QV6qzxUpPmFCc=' \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"getnetworkinfo","params":[]}' \
  http://127.0.0.1:18232/ | jq '.'
```

### 3. Get Block by Height
```bash
curl -s --user '__cookie__:2QziVuhOIpnYnrBumcRYyb2HqCkOM7QV6qzxUpPmFCc=' \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"getblock","params":["1000000"]}' \
  http://127.0.0.1:18232/ | jq '.'
```

### 4. Get Transaction
```bash
curl -s --user '__cookie__:2QziVuhOIpnYnrBumcRYyb2HqCkOM7QV6qzxUpPmFCc=' \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"getrawtransaction","params":["TXID",1]}' \
  http://127.0.0.1:18232/ | jq '.'
```

---

## Zallet Commands (Available Once Synced)

**Status:** Zallet is syncing. RPC will be available at `http://127.0.0.1:28232/`
**Credentials:** `zcashrpc:testpass123`

### Helper Function
```bash
zallet_rpc() {
    curl -s --user "zcashrpc:testpass123" \
        --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"test\",\"method\":\"$1\",\"params\":$2}" \
        http://127.0.0.1:28232/
}
```

### 1. List Accounts
```bash
curl -s --user "zcashrpc:testpass123" \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_listaccounts","params":[]}' \
  http://127.0.0.1:28232/ | jq '.'
```

**Expected Output:**
```json
{
  "result": [
    {
      "account_uuid": "550e8400-e29b-41d4-a716-446655440000",
      "has_spending_key": true,
      "addresses": [...]
    }
  ]
}
```

**Save the account_uuid for other commands!**

### 2. Get Unified Address
```bash
# Replace UUID with your account_uuid from step 1
UUID="your-account-uuid"

curl -s --user "zcashrpc:testpass123" \
  --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"1\",\"method\":\"z_getaddressforaccount\",\"params\":[\"$UUID\"]}" \
  http://127.0.0.1:28232/ | jq '.result.address'
```

**Output:** `utest1...` (unified address)

### 3. Get Sapling Address (For Faucets)
```bash
UUID="your-account-uuid"

curl -s --user "zcashrpc:testpass123" \
  --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"1\",\"method\":\"z_getaddressforaccount\",\"params\":[\"$UUID\",[\"sapling\"]]}" \
  http://127.0.0.1:28232/ | jq '.result.address'
```

**Output:** `ztestsapling1...` (shielded address)
**Use this for faucets!**

### 4. Check Balance
```bash
UUID="your-account-uuid"

curl -s --user "zcashrpc:testpass123" \
  --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"1\",\"method\":\"z_getbalanceforaccount\",\"params\":[\"$UUID\"]}" \
  http://127.0.0.1:28232/ | jq '.'
```

**Output:**
```json
{
  "result": {
    "pools": {
      "sapling": {
        "valueZat": 10000000
      }
    }
  }
}
```

### 5. List Unspent Outputs
```bash
curl -s --user "zcashrpc:testpass123" \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_listunspent","params":[]}' \
  http://127.0.0.1:28232/ | jq '.'
```

### 6. Send Transaction
```bash
FROM_ADDR="ztestsapling1..."  # Your funded address
TO_ADDR="ztestsapling1..."    # Destination
AMOUNT=0.01                   # Amount in ZEC

curl -s --user "zcashrpc:testpass123" \
  --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"1\",\"method\":\"z_sendmany\",\"params\":[\"$FROM_ADDR\",[{\"address\":\"$TO_ADDR\",\"amount\":$AMOUNT}],null,null]}" \
  http://127.0.0.1:28232/ | jq '.'
```

**Returns:** `{"result":{"txids":["abc123..."]}}`

### 7. Send with Memo (For Bridge)
```bash
FROM_ADDR="ztestsapling1..."
CUSTODY_ADDR="ztestsapling1..."
NEAR_ACCOUNT="your-account.testnet"

# Encode memo as hex
MEMO=$(echo -n "company:$NEAR_ACCOUNT" | xxd -p)

curl -s --user "zcashrpc:testpass123" \
  --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"1\",\"method\":\"z_sendmany\",\"params\":[\"$FROM_ADDR\",[{\"address\":\"$CUSTODY_ADDR\",\"amount\":0.01,\"memo\":\"$MEMO\"}],null,null]}" \
  http://127.0.0.1:28232/ | jq '.'
```

### 8. View Transaction
```bash
TXID="abc123..."

curl -s --user "zcashrpc:testpass123" \
  --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"1\",\"method\":\"z_viewtransaction\",\"params\":[\"$TXID\"]}" \
  http://127.0.0.1:28232/ | jq '.'
```

### 9. Validate Address
```bash
ADDR="ztestsapling1..."

curl -s --user "zcashrpc:testpass123" \
  --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"1\",\"method\":\"z_validateaddress\",\"params\":[\"$ADDR\"]}" \
  http://127.0.0.1:28232/ | jq '.'
```

### 10. Get Total Balance
```bash
curl -s --user "zcashrpc:testpass123" \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"getbalance","params":[]}' \
  http://127.0.0.1:28232/ | jq '.'
```

---

## Complete Workflow

### Step 1: Wait for Zallet to Sync
```bash
# Check logs
tail -f /tmp/zallet.log

# Look for: "Validator syncing with network"
# Wait until it stabilizes and RPC starts
```

### Step 2: Get Your Address
```bash
# 1. List accounts
UUID=$(curl -s --user "zcashrpc:testpass123" \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_listaccounts","params":[]}' \
  http://127.0.0.1:28232/ | jq -r '.result[0].account_uuid')

echo "Account UUID: $UUID"

# 2. Get sapling address
ADDR=$(curl -s --user "zcashrpc:testpass123" \
  --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"1\",\"method\":\"z_getaddressforaccount\",\"params\":[\"$UUID\",[\"sapling\"]]}" \
  http://127.0.0.1:28232/ | jq -r '.result.address')

echo "Your testnet address: $ADDR"
```

### Step 3: Get Testnet ZEC
Visit faucets with your address:
- https://faucet.testnet.z.cash/
- https://testnet.zecfaucet.com/

### Step 4: Check Balance
```bash
curl -s --user "zcashrpc:testpass123" \
  --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"1\",\"method\":\"z_getbalanceforaccount\",\"params\":[\"$UUID\"]}" \
  http://127.0.0.1:28232/ | jq '.result.pools.sapling.valueZat'
```

### Step 5: Send Test Transaction
```bash
# Send 0.01 ZEC to another address
curl -s --user "zcashrpc:testpass123" \
  --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"1\",\"method\":\"z_sendmany\",\"params\":[\"$ADDR\",[{\"address\":\"ztestsapling1...\",\"amount\":0.01}],null,null]}" \
  http://127.0.0.1:28232/ | jq '.'
```

---

## Troubleshooting

### Zallet RPC Not Responding
**Symptom:** Connection refused on port 28232
**Cause:** Zallet still syncing
**Solution:** Wait for logs to show sync completion

```bash
tail -f /tmp/zallet.log | grep -i "sync\|rpc"
```

### Zebra Cookie Changed
**Symptom:** Zallet can't connect to Zebra
**Cause:** Zebra cookie rotates
**Solution:** Get new cookie and update Zallet config

```bash
# Get new cookie
NEW_COOKIE=$(docker exec zebra-testnet cat /home/zebra/.cache/zebra/.cookie)

# Update Zallet config
sed -i '' "s/validator_password = .*/validator_password = \"${NEW_COOKIE#*:}\"/" ~/.zallet/zallet.toml

# Restart Zallet
pkill -f "zallet.*start"
/Users/norman/Development/NEAR/zallet/target/release/zallet -d ~/.zallet start &
```

### Balance Shows Zero
**Symptom:** `z_getbalanceforaccount` returns 0
**Cause:** Zallet not fully synced with your transactions
**Solution:** Wait for Zallet to catch up to current block height

---

## Quick Reference Card

```bash
# === ZEBRA (Works Now) ===
# Get sync status
docker logs zebra-testnet 2>&1 | grep "sync_percent" | tail -1

# Get blockchain info
curl -s --user '__cookie__:COOKIE_VALUE' \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"getblockchaininfo","params":[]}' \
  http://127.0.0.1:18232/ | jq '.result.blocks'

# === ZALLET (After Sync) ===
# List accounts
curl -s --user "zcashrpc:testpass123" \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_listaccounts","params":[]}' \
  http://127.0.0.1:28232/ | jq '.result[0].account_uuid'

# Get address
curl -s --user "zcashrpc:testpass123" \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_getaddressforaccount","params":["UUID",["sapling"]]}' \
  http://127.0.0.1:28232/ | jq '.result.address'

# Check balance
curl -s --user "zcashrpc:testpass123" \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_getbalanceforaccount","params":["UUID"]}' \
  http://127.0.0.1:28232/ | jq '.result.pools.sapling.valueZat'

# Send ZEC
curl -s --user "zcashrpc:testpass123" \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_sendmany","params":["FROM",[{"address":"TO","amount":0.01}],null,null]}' \
  http://127.0.0.1:28232/ | jq '.'
```

---

## Full Documentation

- **Setup Guide:** `docs/ZCASH_SETUP.md`
- **Complete RPC Reference:** `docs/ZCASH_RPC_REFERENCE.md`
- **Zallet Docs:** https://zcash.github.io/wallet/
- **Zebra Docs:** https://zebra.zfnd.org/

---

**Next Steps:**
1. ⏳ Wait for Zallet to finish syncing (~15-30 min)
2. ✅ Test `z_listaccounts` to get your UUID
3. ✅ Get your sapling address
4. ✅ Request testnet ZEC from faucets
5. ✅ Test sending transactions
6. ✅ Start bridge integration!
