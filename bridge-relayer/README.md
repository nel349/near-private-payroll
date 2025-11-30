# Zcash ↔ NEAR Bridge Relayer

This relayer service bridges Zcash testnet and NEAR testnet for the Private Payroll system.

## What It Does

1. **Monitors Zcash**: Watches a custody address for incoming ZEC deposits
2. **Mints wZEC**: When ZEC is received, mints equivalent wZEC on NEAR
3. **Processes Withdrawals**: Sends ZEC from custody when employees withdraw (TODO)

## Quick Start

### 1. Prerequisites

**Zcash testnet node:**
```bash
# Option A: Docker (easiest)
docker run -d \
  --name zcash-testnet \
  -v ~/.zcash:/root/.zcash \
  -p 18232:18232 \
  electriccoinco/zcashd:latest \
  zcashd -testnet -printtoconsole

# Option B: Native
zcashd -testnet -daemon
```

**NEAR account:**
```bash
near login
# Creates credentials in ~/.near-credentials/
```

### 2. Install Dependencies

```bash
cd bridge-relayer
npm install
```

### 3. Configure

```bash
# Copy example config
cp .env.example .env

# Edit .env with your values
nano .env
```

**Required values:**
- `ZCASH_CUSTODY_ADDRESS`: Shielded address for bridge deposits (create with `zcash-cli -testnet z_getnewaddress sapling`)
- `ZCASH_RPC_PASSWORD`: From `~/.zcash/zcash.conf`
- `NEAR_RELAYER_ACCOUNT`: Your testnet account (e.g., `relayer.your-account.testnet`)
- `WZEC_CONTRACT`: Deployed wZEC contract address
- `INTENTS_ADAPTER`: Deployed intents adapter address

### 4. Create Custody Address

```bash
# Generate new shielded address
zcash-cli -testnet z_getnewaddress sapling

# Output: zs1abc123...
# Add this to .env as ZCASH_CUSTODY_ADDRESS
```

### 5. Fund Custody Address (Testing)

Get testnet ZEC and send to custody:

```bash
# Get from faucet: https://faucet.testnet.z.cash/
# Then send to your custody address

zcash-cli -testnet z_sendmany \
  "zs1your_funded_address" \
  '[{
    "address": "zs1your_custody_address",
    "amount": 0.1
  }]'
```

### 6. Run Relayer

```bash
npm start
```

Expected output:
```
🌉 Zcash → NEAR Bridge Relayer
================================

Testing Zcash RPC connection...
  ✅ Connected to Zcash testnet
  Block height: 2500000
  Chain: test

Custody address: zs1abc123...
Custody balance: 0.1 ZEC

Connecting to NEAR testnet ...
  ✅ Connected as: relayer.your-account.testnet
  Balance: 10.5 NEAR

Configuration:
  wZEC Contract: wzec-123456.your-account.testnet
  Intents Adapter: intents-123456.your-account.testnet
  Poll Interval: 30 seconds

🚀 Relayer started! Monitoring for deposits...
```

## Testing the Bridge

### Test Deposit Flow

**Terminal 1: Run relayer**
```bash
npm start
```

**Terminal 2: Send test deposit**
```bash
# Send ZEC to custody with company memo
zcash-cli -testnet z_sendmany \
  "zs1your_source_address" \
  '[{
    "address": "zs1your_custody_address",
    "amount": 0.01,
    "memo": "'$(echo -n "company:company.your-account.testnet" | xxd -p)'"
  }]'

# Get operation ID
# opid-abc123...

# Wait for completion
zcash-cli -testnet z_getoperationstatus '["opid-abc123..."]'
```

**Terminal 3: Verify wZEC minted**
```bash
# Wait 1-2 minutes for Zcash confirmation
# Then check NEAR balance

near view wzec-123456.your-account.testnet ft_balance_of \
  '{"account_id": "company.your-account.testnet"}' \
  --networkId testnet

# Expected: "1000000" (0.01 ZEC = 1,000,000 smallest units)
```

### Memo Format

Include company account in transaction memo:

```bash
# Format: "company:account.testnet"
# Encode to hex:
echo -n "company:company.your-account.testnet" | xxd -p
# Output: 636f6d70616e793a636f6d70616e792e796f75722d6163636f756e742e746573746e6574

# Use in z_sendmany:
"memo": "636f6d70616e793a636f6d70616e792e796f75722d6163636f756e742e746573746e6574"
```

If no memo is provided, wZEC is minted to `default.testnet`.

## Monitoring

### View Relayer State

```bash
cat relayer-state.json
```

Shows:
- Last processed Zcash block
- Processed transaction IDs
- Pending withdrawals

### Check Zcash Transactions

```bash
# List received to custody
zcash-cli -testnet z_listreceivedbyaddress "zs1your_custody_address" 1

# View specific transaction
zcash-cli -testnet gettransaction <txid>
```

### Check NEAR Transactions

```bash
# View wZEC balance
near view wzec-123456.your-account.testnet ft_balance_of \
  '{"account_id": "company.your-account.testnet"}' \
  --networkId testnet

# View total supply
near view wzec-123456.your-account.testnet ft_total_supply \
  --networkId testnet
```

## Architecture

```
┌─────────────┐
│   Company   │
│  (Zcash)    │
└──────┬──────┘
       │ 1. Send ZEC with memo
       │    "company:account.testnet"
       ▼
┌─────────────────────────┐
│  Custody Address (zs1)  │
│  (Shielded Balance)     │
└──────┬──────────────────┘
       │
       │ 2. Relayer detects
       ▼
┌─────────────────────────┐
│   Bridge Relayer        │
│   - Monitor deposits    │
│   - Parse memos         │
│   - Call NEAR mint      │
└──────┬──────────────────┘
       │ 3. Mint wZEC
       ▼
┌─────────────────────────┐
│  wZEC Contract (NEAR)   │
│  - Mint tokens          │
│  - Track supply         │
└──────┬──────────────────┘
       │ 4. Transfer to intents
       ▼
┌─────────────────────────┐
│  Intents Adapter        │
│  - Receive wZEC         │
│  - Forward to payroll   │
└──────┬──────────────────┘
       │ 5. Company balance updated
       ▼
┌─────────────────────────┐
│  Payroll Contract       │
│  - Company can pay      │
│  - Employees withdraw   │
└─────────────────────────┘
```

## Troubleshooting

### "Zcash connection failed"

```bash
# Check if zcashd is running
ps aux | grep zcashd

# Start if not running
zcashd -testnet -daemon

# Check RPC is accessible
curl --user zcashrpc:password \
  --data-binary '{"jsonrpc":"1.0","id":"test","method":"getinfo"}' \
  http://127.0.0.1:18232
```

### "NEAR connection failed"

```bash
# Check credentials exist
ls ~/.near-credentials/testnet/

# Login if missing
near login

# Test connection
near state relayer.your-account.testnet --networkId testnet
```

### "Mint failed: Owner only"

The relayer account needs to be the owner of the wZEC contract, or the owner needs to have authorized the relayer as a minter.

### Transaction Not Detected

- Ensure transaction has 1+ confirmations (~2.5 minutes)
- Check relayer is running and polling
- Verify custody address is correct
- Check `relayer-state.json` for last processed block

## Production Considerations

⚠️ **This is a testnet demo!** For production:

1. **Security**:
   - Use hardware wallet for custody address
   - Implement multi-sig for large amounts
   - Add rate limiting and anomaly detection
   - Encrypt sensitive data

2. **Reliability**:
   - Run multiple relayers for redundancy
   - Add retry logic and error recovery
   - Monitor with alerting
   - Database instead of JSON state file

3. **Compliance**:
   - KYC/AML for large deposits
   - Transaction monitoring
   - Audit logging

4. **Testing**:
   - Comprehensive test suite
   - Mainnet dry-run period
   - Bug bounty program

## Next Steps

- [ ] Implement withdrawal processing (NEAR → Zcash)
- [ ] Add database for state tracking
- [ ] Web dashboard for monitoring
- [ ] Alerts for errors and large transactions
- [ ] Multi-sig custody address
- [ ] Mainnet deployment (with audit)

## Resources

- [Zcash Testnet Setup Guide](../docs/ZCASH_TESTNET_SETUP.md)
- [NEAR Intents Manual Testing](../docs/INTENTS_MANUAL_TESTING.md)
- [Zcash RPC Documentation](https://zcash.readthedocs.io/en/latest/rtd_pages/rpc.html)
- [NEAR API JS Docs](https://docs.near.org/tools/near-api-js)
