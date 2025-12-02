# Zallet RPC Command Reference

**Last Updated:** 2025-11-30
**Wallet:** Zallet v0.1.0-alpha.2
**Network:** Testnet

---

## Overview

This guide covers all essential Zallet RPC commands for:
- Getting addresses
- Checking balances
- Sending transactions
- Managing accounts

### Prerequisites

- Zallet running with RPC enabled
- RPC credentials configured in `~/.zallet/zallet.toml`

### RPC Configuration

Add to `~/.zallet/zallet.toml`:

```toml
[rpc]
bind = ["127.0.0.1:28232"]

[[rpc.auth]]
user = "zcashrpc"
password = "testpass123"
```

Restart Zallet after config changes.

---

## Account Management

Zallet uses **account UUIDs** instead of individual addresses. Each account can have multiple addresses.

### List Accounts

```bash
curl --user zcashrpc:testpass123 \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_listaccounts","params":[]}' \
  -H 'content-type: text/plain;' \
  http://127.0.0.1:28232/
```

**Response:**
```json
{
  "result": [
    {
      "account_uuid": "550e8400-e29b-41d4-a716-446655440000",
      "has_spending_key": true,
      "addresses": [
        {
          "diversifier_index": 0,
          "receiver_types": ["p2pkh", "sapling", "orchard"]
        }
      ]
    }
  ]
}
```

**Save the `account_uuid`** - you'll need it for other commands.

### Create New Account (Not Needed Initially)

Your wallet already has an account from the mnemonic generation. If you need more:

```bash
curl --user zcashrpc:testpass123 \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_getnewaccount","params":[]}' \
  -H 'content-type: text/plain;' \
  http://127.0.0.1:28232/
```

---

## Address Management

### Get Address for Account

**Unified Address (recommended):**
```bash
curl --user zcashrpc:testpass123 \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_getaddressforaccount","params":["<account_uuid>"]}' \
  -H 'content-type: text/plain;' \
  http://127.0.0.1:28232/
```

**Response:**
```json
{
  "result": {
    "address": "utest1...",  // Unified address (testnet)
    "receiver_types": ["p2pkh", "sapling", "orchard"]
  }
}
```

**Sapling-only Address (for compatibility):**
```bash
curl --user zcashrpc:testpass123 \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_getaddressforaccount","params":["<account_uuid>",["sapling"]]}' \
  -H 'content-type: text/plain;' \
  http://127.0.0.1:28232/
```

**Response:**
```json
{
  "result": {
    "address": "ztestsapling1...",  // Shielded address
    "receiver_types": ["sapling"]
  }
}
```

### List All Addresses

```bash
curl --user zcashrpc:testpass123 \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"listaddresses","params":[]}' \
  -H 'content-type: text/plain;' \
  http://127.0.0.1:28232/
```

---

## Balance Checking

### Get Balance for Account

```bash
curl --user zcashrpc:testpass123 \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_getbalanceforaccount","params":["<account_uuid>"]}' \
  -H 'content-type: text/plain;' \
  http://127.0.0.1:28232/
```

**Response:**
```json
{
  "result": {
    "pools": {
      "sapling": {
        "valueZat": 10000000  // 0.1 ZEC
      },
      "orchard": {
        "valueZat": 0
      }
    }
  }
}
```

**Note:** Values are in zatoshis (1 ZEC = 100,000,000 zatoshis)

### Get Total Wallet Balance

```bash
curl --user zcashrpc:testpass123 \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"getbalance","params":[]}' \
  -H 'content-type: text/plain;' \
  http://127.0.0.1:28232/
```

### List Unspent Outputs

```bash
curl --user zcashrpc:testpass123 \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_listunspent","params":[]}' \
  -H 'content-type: text/plain;' \
  http://127.0.0.1:28232/
```

---

## Sending Transactions

### Basic Send (z_sendmany)

**Important:** Zallet's `z_sendmany` has modified behavior:
- Fee must be `null` (ZIP 317 fees always used)
- Returns array of `txids` instead of single `txid`

```bash
curl --user zcashrpc:testpass123 \
  --data-binary '{
    "jsonrpc":"1.0",
    "id":"1",
    "method":"z_sendmany",
    "params":[
      "FROM_ADDRESS",
      [
        {
          "address": "TO_ADDRESS",
          "amount": 0.01
        }
      ],
      null,
      null
    ]
  }' \
  -H 'content-type: text/plain;' \
  http://127.0.0.1:28232/
```

**Response:**
```json
{
  "result": {
    "txids": ["abc123..."]
  }
}
```

### Send with Memo (For Bridge Deposits)

```bash
# Encode memo as hex
MEMO=$(echo -n "company:your-account.testnet" | xxd -p)

curl --user zcashrpc:testpass123 \
  --data-binary "{
    \"jsonrpc\":\"1.0\",
    \"id\":\"1\",
    \"method\":\"z_sendmany\",
    \"params\":[
      \"FROM_ADDRESS\",
      [
        {
          \"address\": \"CUSTODY_ADDRESS\",
          \"amount\": 0.01,
          \"memo\": \"$MEMO\"
        }
      ],
      null,
      null
    ]
  }" \
  -H 'content-type: text/plain;' \
  http://127.0.0.1:28232/
```

### Check Transaction Status

```bash
curl --user zcashrpc:testpass123 \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_viewtransaction","params":["<txid>"]}' \
  -H 'content-type: text/plain;' \
  http://127.0.0.1:28232/
```

---

## Bridge Integration Commands

### 1. Get Custody Address

```bash
# List accounts
ACCOUNT_UUID=$(curl -s --user zcashrpc:testpass123 \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_listaccounts","params":[]}' \
  http://127.0.0.1:28232/ | jq -r '.result[0].account_uuid')

# Get shielded address for custody
curl --user zcashrpc:testpass123 \
  --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"1\",\"method\":\"z_getaddressforaccount\",\"params\":[\"$ACCOUNT_UUID\",[\"sapling\"]]}" \
  http://127.0.0.1:28232/ | jq -r '.result.address'
```

### 2. Monitor for Incoming Transactions

```bash
# Get all unspent outputs
curl -s --user zcashrpc:testpass123 \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_listunspent","params":[]}' \
  http://127.0.0.1:28232/
```

### 3. Send Test Deposit

```bash
# From your funded address to custody address with NEAR account memo
FROM_ADDR="ztestsapling1..."  # Your funded address
CUSTODY_ADDR="ztestsapling1..."  # Custody address
NEAR_ACCOUNT="your-account.testnet"
MEMO=$(echo -n "company:$NEAR_ACCOUNT" | xxd -p)

curl --user zcashrpc:testpass123 \
  --data-binary "{
    \"jsonrpc\":\"1.0\",
    \"id\":\"1\",
    \"method\":\"z_sendmany\",
    \"params\":[
      \"$FROM_ADDR\",
      [{\"address\":\"$CUSTODY_ADDR\",\"amount\":0.01,\"memo\":\"$MEMO\"}],
      null,
      null
    ]
  }" \
  http://127.0.0.1:28232/
```

---

## Complete Workflow Example

### Setup: Get Your First Address

```bash
#!/bin/bash

RPC_USER="zcashrpc"
RPC_PASS="testpass123"
RPC_URL="http://127.0.0.1:28232/"

# 1. List accounts
echo "=== Getting Account UUID ==="
ACCOUNT_UUID=$(curl -s --user $RPC_USER:$RPC_PASS \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_listaccounts","params":[]}' \
  $RPC_URL | jq -r '.result[0].account_uuid')

echo "Account UUID: $ACCOUNT_UUID"

# 2. Get shielded address
echo -e "\n=== Getting Shielded Address ==="
ADDRESS=$(curl -s --user $RPC_USER:$RPC_PASS \
  --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"1\",\"method\":\"z_getaddressforaccount\",\"params\":[\"$ACCOUNT_UUID\",[\"sapling\"]]}" \
  $RPC_URL | jq -r '.result.address')

echo "Your testnet address: $ADDRESS"
echo ""
echo "Use this address to:"
echo "  1. Get testnet ZEC from faucets"
echo "  2. Receive deposits"
echo ""
echo "Save this for your bridge relayer config!"
```

### Usage: Check Balance and Send

```bash
#!/bin/bash

RPC_USER="zcashrpc"
RPC_PASS="testpass123"
RPC_URL="http://127.0.0.1:28232/"
ACCOUNT_UUID="<your-account-uuid>"

# Check balance
echo "=== Current Balance ==="
curl -s --user $RPC_USER:$RPC_PASS \
  --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"1\",\"method\":\"z_getbalanceforaccount\",\"params\":[\"$ACCOUNT_UUID\"]}" \
  $RPC_URL | jq '.result.pools.sapling.valueZat'

# List transactions
echo -e "\n=== Recent Transactions ==="
curl -s --user $RPC_USER:$RPC_PASS \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_listunspent","params":[]}' \
  $RPC_URL | jq '.result[] | {address, amount: .value, txid, memo}'
```

---

## Common Error Messages

### "missing field 'indexer'"
**Cause:** Corrupted config file
**Fix:** Regenerate config with `zallet example-config`

### "Could not establish connection with node"
**Cause:** Zebra not synced enough or not running
**Fix:** Check Zebra sync status, wait until ~20%

### "insufficient funds"
**Cause:** Not enough ZEC in wallet
**Fix:** Get testnet ZEC from faucets

### "invalid memo"
**Cause:** Memo not properly hex-encoded
**Fix:** Use `xxd -p` to encode memo: `echo -n "text" | xxd -p`

---

## Key Differences from zcashd

| Feature | zcashd | Zallet |
|---------|--------|--------|
| Address generation | `z_getnewaddress` | `z_getaddressforaccount` |
| Balance check | `z_getbalance "addr"` | `z_getbalanceforaccount "uuid"` |
| Account model | Address-based | UUID-based |
| Fee handling | Manual | Automatic (ZIP 317) |
| Response format | Single `txid` | Array `txids` |

---

## Official Documentation

- **Zallet RPC Docs:** https://zcash.github.io/wallet/zcashd/json_rpc.html
- **Zallet CLI Guide:** https://zcash.github.io/wallet/cli/index.html
- **ZIP 317 (Fees):** https://zips.z.cash/zip-0317
- **Zcash RPC (zcashd):** https://zcash.readthedocs.io/en/latest/rtd_pages/rpc.html

---

## Testing Checklist

Before integrating with bridge:

- [ ] Zallet RPC responds to `z_listaccounts`
- [ ] Got shielded address with `z_getaddressforaccount`
- [ ] Received testnet ZEC from faucet
- [ ] Balance shows in `z_getbalanceforaccount`
- [ ] Sent test transaction with `z_sendmany`
- [ ] Transaction confirmed (check with `z_viewtransaction`)
- [ ] Sent transaction with memo (hex-encoded)
- [ ] Retrieved memo from transaction

---

## Quick Reference Card

```bash
# Get account UUID
curl -s --user USER:PASS --data-binary \
  '{"jsonrpc":"1.0","id":"1","method":"z_listaccounts","params":[]}' \
  http://127.0.0.1:28232/ | jq -r '.result[0].account_uuid'

# Get address
curl -s --user USER:PASS --data-binary \
  '{"jsonrpc":"1.0","id":"1","method":"z_getaddressforaccount","params":["UUID",["sapling"]]}' \
  http://127.0.0.1:28232/ | jq -r '.result.address'

# Check balance
curl -s --user USER:PASS --data-binary \
  '{"jsonrpc":"1.0","id":"1","method":"z_getbalanceforaccount","params":["UUID"]}' \
  http://127.0.0.1:28232/ | jq '.result.pools.sapling.valueZat'

# Send ZEC
curl --user USER:PASS --data-binary \
  '{"jsonrpc":"1.0","id":"1","method":"z_sendmany","params":["FROM",[{"address":"TO","amount":0.01}],null,null]}' \
  http://127.0.0.1:28232/
```

---

**Ready to integrate!** See `ZCASH_SETUP.md` for installation instructions.
