# NEAR Private Payroll - Deployment Guide

This guide covers deploying the Private Payroll system with cross-chain intents integration to NEAR testnet.

## Prerequisites

### 1. Install NEAR CLI

```bash
npm install -g near-cli
```

### 2. Install cargo-near (for contract building)

```bash
cargo install cargo-near
```

### 3. Create and Fund Testnet Account

```bash
# Login to NEAR testnet (opens browser)
near login

# This creates a testnet account like: your-name.testnet
# Funded automatically with testnet NEAR tokens
```

Verify your account:
```bash
near state your-account.testnet --networkId testnet
```

## Quick Start Deployment

### Step 1: Build All Contracts

```bash
./scripts/build-all.sh
```

This builds all 4 contracts:
- `wzec-token` - Wrapped ZEC token (NEP-141)
- `zk-verifier` - Groth16 proof verifier
- `payroll` - Main payroll logic
- `intents-adapter` - Cross-chain bridge adapter

**Output:** WASM files in `./target/near/`

### Step 2: Deploy to Testnet

```bash
./scripts/deploy-testnet.sh your-account.testnet
```

**What this does:**
1. Creates 4 subaccounts under your account:
   - `wzec-{timestamp}.your-account.testnet`
   - `verifier-{timestamp}.your-account.testnet`
   - `payroll-{timestamp}.your-account.testnet`
   - `intents-{timestamp}.your-account.testnet`

2. Deploys and initializes all contracts

3. Configures relationships:
   - Payroll → Intents Adapter
   - Contracts registered with wZEC token
   - Cross-chain settings configured

4. Saves deployment info to `deployment-testnet-{timestamp}.json`

**Example Output:**
```
═══════════════════════════════════════════════════════════════
Contract Addresses:
═══════════════════════════════════════════════════════════════

  wZEC Token:        wzec-1701234567.your-account.testnet
  ZK Verifier:       verifier-1701234567.your-account.testnet
  Payroll:           payroll-1701234567.your-account.testnet
  Intents Adapter:   intents-1701234567.your-account.testnet

  Owner:             your-account.testnet
  Network:           testnet
```

## Testing the Deployment

### 1. Mint Test wZEC

Simulate a bridge mint from Zcash:

```bash
export WZEC="wzec-1701234567.your-account.testnet"
export OWNER="your-account.testnet"

# Mint 10 ZEC to test company account
near call $WZEC mint \
  '{"receiver_id": "company.testnet", "amount": "1000000000", "zcash_tx_hash": "test_zcash_tx_123"}' \
  --accountId $OWNER \
  --deposit 0.01 \
  --networkId testnet
```

### 2. Company Deposits to Payroll

Deposit wZEC via intents adapter:

```bash
export INTENTS="intents-1701234567.your-account.testnet"

# Company deposits 5 ZEC to payroll
near call $WZEC ft_transfer_call \
  '{"receiver_id": "'$INTENTS'", "amount": "500000000", "msg": "deposit:company.testnet:zcash:deposit_tx_456"}' \
  --accountId company.testnet \
  --depositYocto 1 \
  --gas 300000000000000 \
  --networkId testnet
```

**Verify:**
```bash
export PAYROLL="payroll-1701234567.your-account.testnet"

# Check company balance in payroll
near view $PAYROLL get_company_balance --networkId testnet
# Should return: '500000000' (5 ZEC)
```

### 3. Add Employee

```bash
# Note: In production, use SDK to properly encrypt data
# This is a simplified example with mock encrypted data

near call $PAYROLL add_employee \
  '{
    "employee_id": "employee.testnet",
    "encrypted_name": [1,2,3,4],
    "encrypted_salary": [5,6,7,8],
    "salary_commitment": [9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9,9],
    "public_key": [10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10,10]
  }' \
  --accountId $OWNER \
  --networkId testnet
```

### 4. Test Cross-Chain Withdrawal

Employee withdraws to Zcash testnet:

```bash
# Withdraw 1 ZEC to Zcash testnet address
# Note: Employee must have balance first (via payment with ZK proof)

near call $PAYROLL withdraw_via_intents \
  '{
    "amount": "100000000",
    "destination_chain": "Zcash",
    "destination_address": "tmYourZcashTestnetAddress"
  }' \
  --accountId employee.testnet \
  --gas 300000000000000 \
  --networkId testnet
```

**Check withdrawal status:**
```bash
# Get withdrawal ID from logs, then:
near view $INTENTS get_pending_withdrawal \
  '{"withdrawal_id": "abc123..."}' \
  --networkId testnet
```

## Viewing Contract State

### Payroll Contract

```bash
# Get company balance
near view $PAYROLL get_company_balance --networkId testnet

# Get employee info
near view $PAYROLL get_employee \
  '{"employee_id": "employee.testnet"}' \
  --networkId testnet

# Get employee balance
near view $PAYROLL get_employee_balance \
  '{"employee_id": "employee.testnet"}' \
  --networkId testnet

# Get contract stats
near view $PAYROLL get_stats --networkId testnet
```

### Intents Adapter

```bash
# Get chain config
near view $INTENTS get_chain_config \
  '{"chain": "Zcash"}' \
  --networkId testnet

# Get stats
near view $INTENTS get_stats --networkId testnet

# Get authorized relayers
near view $INTENTS get_relayers --networkId testnet

# Check if token is supported
near view $INTENTS is_token_supported \
  '{"token": "'$WZEC'"}' \
  --networkId testnet
```

### wZEC Token

```bash
# Get token metadata
near view $WZEC ft_metadata --networkId testnet

# Check balance
near view $WZEC ft_balance_of \
  '{"account_id": "company.testnet"}' \
  --networkId testnet

# Get total supply
near view $WZEC ft_total_supply --networkId testnet
```

## Admin Operations

### Configure Cross-Chain Settings

```bash
# Update Zcash configuration
near call $INTENTS update_chain_config \
  '{
    "config": {
      "chain": "Zcash",
      "deposit_enabled": true,
      "withdrawal_enabled": true,
      "min_withdrawal": 10000000,
      "max_withdrawal": 0,
      "fee_bps": 50,
      "bridge_address": "your-zcash-bridge.near"
    }
  }' \
  --accountId $OWNER \
  --networkId testnet
```

### Add Bridge Relayer

```bash
# Add authorized relayer for cross-chain confirmations
near call $INTENTS add_relayer \
  '{"relayer": "relayer.testnet"}' \
  --accountId $OWNER \
  --networkId testnet
```

### Confirm Cross-Chain Deposit

```bash
# Called by relayer when ZEC is deposited on Zcash side
near call $INTENTS confirm_cross_chain_deposit \
  '{
    "source_tx_hash": "zcash_tx_hash_123",
    "amount": "100000000",
    "company_id": "company.testnet",
    "source_chain": "Zcash"
  }' \
  --accountId relayer.testnet \
  --networkId testnet
```

### Confirm Withdrawal Complete

```bash
# Called by relayer when withdrawal completes on destination chain
near call $INTENTS confirm_withdrawal_complete \
  '{
    "withdrawal_id": "withdrawal_id_from_logs",
    "destination_tx_hash": "zcash_tx_hash_456"
  }' \
  --accountId relayer.testnet \
  --networkId testnet
```

## Mainnet Deployment

**⚠️ IMPORTANT: DO NOT deploy to mainnet without:**

1. **Security Audit** - All contracts should be audited
2. **Real Bridge Integration** - Connect to actual Zcash bridge
3. **Relayer Service** - Deploy automated relayer
4. **Testing** - Extensive testnet testing first
5. **Insurance/Multisig** - Consider insurance and multi-sig controls

**Mainnet deployment steps:**

```bash
# 1. Build with reproducible builds
cd contracts/each-contract
cargo near build

# 2. Deploy with mainnet account
./scripts/deploy-mainnet.sh your-account.near

# 3. Configure real bridge addresses
# 4. Set up relayer service
# 5. Enable mainnet chain configs
```

## Troubleshooting

### "Account not found"
- Make sure you're logged in: `near login`
- Verify account exists: `near state your-account.testnet --networkId testnet`

### "Contract panicked: Only owner"
- Ensure you're calling from the owner account
- Check ownership: `near view $CONTRACT get_owner --networkId testnet`

### "Token not registered"
- Register account with wZEC:
  ```bash
  near call $WZEC storage_deposit \
    '{"account_id": "your-account.testnet"}' \
    --accountId your-account.testnet \
    --deposit 0.01 \
    --networkId testnet
  ```

### "Insufficient balance"
- Check balance: `near view $PAYROLL get_employee_balance ...`
- Employee needs to be paid first (with valid ZK proof)

### Transaction failed
```bash
# Get detailed transaction info
near tx-status <transaction-hash> \
  --accountId your-account.testnet \
  --networkId testnet
```

## Monitoring and Logs

### View Recent Transactions

```bash
# On NEAR Explorer
https://testnet.nearblocks.io/address/{contract-address}

# Or using NEAR CLI
near tx-status <hash> --accountId $OWNER --networkId testnet
```

### Enable Logging

Set `NEAR_ENV=testnet` and use `--verbose` flag for detailed logs.

## Next Steps

1. **Test Complete Flows** - Run through deposit → pay → withdrawal
2. **Integrate with SDK** - Use TypeScript SDK for better UX
3. **Set Up Relayer** - Implement automated bridge confirmations
4. **Connect Real Bridge** - Integrate with actual Zcash bridge
5. **Build Frontend** - Create UI for company/employee interactions

## Resources

- **NEAR CLI Docs:** https://docs.near.org/tools/near-cli
- **NEAR Testnet Explorer:** https://testnet.nearblocks.io
- **Zcash Testnet Guide:** https://zcash.readthedocs.io/en/latest/rtd_pages/testnet_guide.html
- **NEAR Intents:** https://docs.near-intents.org
- **Project Docs:** `docs/CROSS_CHAIN_INTENTS.md`

---

**Need Help?**
- Check logs in transaction explorer
- Review `docs/INTENTS_IMPLEMENTATION_PROGRESS.md` for architecture
- File issues at project repository
