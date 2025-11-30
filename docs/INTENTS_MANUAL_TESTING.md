# NEAR Intents Manual Testing Guide

**Last Updated:** 2025-11-29
**Purpose:** Step-by-step guide to manually test the NEAR Intents integration on testnet

---

## Overview

This guide covers manual testing of cross-chain functionality:
- **Company Deposits**: Funds flowing from external chains (simulated) to payroll
- **Employee Withdrawals**: Withdrawals from payroll to external chains (Zcash, Solana, Ethereum, etc.)
- **Intents Adapter**: Bridge contract routing between NEAR and other chains

---

## Prerequisites

### 1. Install Tools

```bash
# Install NEAR CLI
npm install -g near-cli

# Install cargo-near for building contracts
cargo install cargo-near

# Verify installations
near --version
cargo near --version
```

### 2. Create Testnet Account

```bash
# Login to NEAR testnet (opens browser for wallet creation)
near login

# This creates: your-name.testnet
# Automatically funded with ~200 NEAR testnet tokens
```

**Verify your account:**
```bash
near state your-account.testnet --networkId testnet

# Expected output:
# Account your-account.testnet
# balance: 200000000000000000000000000 (200 NEAR)
```

### 3. Create Test Accounts

You'll need a company and employee account for testing:

```bash
# Create company subaccount
near create-account company.your-account.testnet \
  --masterAccount your-account.testnet \
  --initialBalance 10 \
  --networkId testnet

# Create employee subaccount
near create-account employee.your-account.testnet \
  --masterAccount your-account.testnet \
  --initialBalance 10 \
  --networkId testnet

# Verify
near state company.your-account.testnet --networkId testnet
near state employee.your-account.testnet --networkId testnet
```

---

## Step 1: Build Contracts

```bash
cd /Users/norman/Development/NEAR/near-private-payroll

# Build all contracts
./scripts/build-all-contracts.sh
```

**Expected output:**
```
Building contracts with cargo-near...
✅ wzec-token built successfully
✅ zk-verifier built successfully
✅ payroll built successfully
✅ intents-adapter built successfully

WASM files ready in: target/near/
```

**Verify build artifacts:**
```bash
ls -lh target/near/*.wasm

# Should see:
# wzec_token.wasm
# zk_verifier.wasm
# payroll.wasm
# intents_adapter.wasm
```

---

## Step 2: Deploy to Testnet

### Option A: Automated Deployment (Recommended)

```bash
./scripts/deploy-testnet.sh your-account.testnet
```

This creates 4 subaccounts and deploys all contracts. **Skip to Step 3** if using this method.

### Option B: Manual Deployment (For Learning)

Set environment variables:
```bash
export OWNER="your-account.testnet"
export TIMESTAMP=$(date +%s)
export WZEC="wzec-$TIMESTAMP.$OWNER"
export VERIFIER="verifier-$TIMESTAMP.$OWNER"
export PAYROLL="payroll-$TIMESTAMP.$OWNER"
export INTENTS="intents-$TIMESTAMP.$OWNER"
```

#### 2.1 Deploy wZEC Token

```bash
# Create subaccount
near create-account $WZEC \
  --masterAccount $OWNER \
  --initialBalance 5 \
  --networkId testnet

# Deploy contract
near deploy $WZEC \
  target/near/wzec_token.wasm \
  --networkId testnet

# Initialize
near call $WZEC new \
  '{"owner": "'$OWNER'", "total_supply": "0"}' \
  --accountId $OWNER \
  --networkId testnet
```

#### 2.2 Deploy ZK Verifier

```bash
# Create subaccount
near create-account $VERIFIER \
  --masterAccount $OWNER \
  --initialBalance 5 \
  --networkId testnet

# Deploy contract
near deploy $VERIFIER \
  target/near/zk_verifier.wasm \
  --networkId testnet

# Initialize
near call $VERIFIER new \
  '{"owner": "'$OWNER'"}' \
  --accountId $OWNER \
  --networkId testnet
```

#### 2.3 Deploy Payroll Contract

```bash
# Create subaccount
near create-account $PAYROLL \
  --masterAccount $OWNER \
  --initialBalance 5 \
  --networkId testnet

# Deploy contract
near deploy $PAYROLL \
  target/near/payroll.wasm \
  --networkId testnet

# Initialize
near call $PAYROLL new \
  '{"owner": "'$OWNER'", "wzec_token": "'$WZEC'", "zk_verifier": "'$VERIFIER'"}' \
  --accountId $OWNER \
  --networkId testnet
```

#### 2.4 Deploy Intents Adapter

```bash
# Create subaccount
near create-account $INTENTS \
  --masterAccount $OWNER \
  --initialBalance 5 \
  --networkId testnet

# Deploy contract
near deploy $INTENTS \
  target/near/intents_adapter.wasm \
  --networkId testnet

# Initialize (using mock intents contract for testing)
near call $INTENTS new \
  '{
    "owner": "'$OWNER'",
    "payroll_contract": "'$PAYROLL'",
    "wzec_token": "'$WZEC'",
    "intents_contract": "intents.testnet"
  }' \
  --accountId $OWNER \
  --networkId testnet
```

#### 2.5 Connect Contracts

```bash
# Set intents adapter in payroll
near call $PAYROLL set_intents_adapter \
  '{"intents_adapter": "'$INTENTS'"}' \
  --accountId $OWNER \
  --networkId testnet

# Add owner as bridge relayer (for testing)
near call $INTENTS add_relayer \
  '{"relayer": "'$OWNER'"}' \
  --accountId $OWNER \
  --networkId testnet

# Register payroll contract with wZEC (for token storage)
near call $WZEC storage_deposit \
  '{"account_id": "'$PAYROLL'"}' \
  --accountId $OWNER \
  --deposit 0.01 \
  --networkId testnet

# Register intents adapter with wZEC
near call $WZEC storage_deposit \
  '{"account_id": "'$INTENTS'"}' \
  --accountId $OWNER \
  --deposit 0.01 \
  --networkId testnet
```

#### 2.6 Save Deployment Info

```bash
# Save for later use
cat > testnet-deployment.env <<EOF
export OWNER="$OWNER"
export WZEC="$WZEC"
export VERIFIER="$VERIFIER"
export PAYROLL="$PAYROLL"
export INTENTS="$INTENTS"
export COMPANY="company.$OWNER"
export EMPLOYEE="employee.$OWNER"
EOF

echo "✅ Deployment complete! Source this file to reload variables:"
echo "source testnet-deployment.env"
```

---

## Step 3: Verify Deployment

```bash
# Source deployment variables (if not already set)
source testnet-deployment.env

# Check intents adapter configuration
near view $INTENTS get_owner --networkId testnet
# Expected: your-account.testnet

near view $INTENTS get_payroll_contract --networkId testnet
# Expected: payroll-{timestamp}.your-account.testnet

near view $INTENTS is_token_supported \
  '{"token": "'$WZEC'"}' \
  --networkId testnet
# Expected: true

near view $INTENTS get_relayers --networkId testnet
# Expected: ["your-account.testnet"]

# Check Zcash chain config
near view $INTENTS get_chain_config \
  '{"chain": "Zcash"}' \
  --networkId testnet
# Expected: chain config object with deposit_enabled: true
```

---

## Step 4: Test Company Deposit Flow

### 4.1 Mint wZEC (Simulate Bridge Operation)

In production, this would be done by a Zcash → NEAR bridge. For testing, we mint directly:

```bash
# Mint 10 ZEC to company account
near call $WZEC mint \
  '{
    "receiver_id": "'$COMPANY'",
    "amount": "1000000000",
    "zcash_tx_hash": "mock_zcash_tx_deposit_001"
  }' \
  --accountId $OWNER \
  --depositYocto 1 \
  --networkId testnet

# Verify company has wZEC
near view $WZEC ft_balance_of \
  '{"account_id": "'$COMPANY'"}' \
  --networkId testnet
# Expected: "1000000000" (10 ZEC)
```

### 4.2 Company Deposits to Payroll via Intents

```bash
# Register company for wZEC storage with intents adapter
near call $WZEC storage_deposit \
  '{"account_id": "'$COMPANY'"}' \
  --accountId $COMPANY \
  --deposit 0.01 \
  --networkId testnet

# Company transfers wZEC to payroll via intents adapter
# Message format: "deposit:company_id:source_chain:source_tx"
near call $WZEC ft_transfer_call \
  '{
    "receiver_id": "'$INTENTS'",
    "amount": "500000000",
    "msg": "deposit:'$COMPANY':zcash:mock_zcash_tx_001"
  }' \
  --accountId $COMPANY \
  --depositYocto 1 \
  --gas 300000000000000 \
  --networkId testnet
```

### 4.3 Verify Deposit

```bash
# Check company balance in payroll contract
near view $PAYROLL get_company_balance --networkId testnet
# Expected: "500000000" (5 ZEC)

# Check intents adapter stats
near view $INTENTS get_stats --networkId testnet
# Expected: [1, 0, 0] (1 deposit, 0 withdrawals, nonce 0)
```

**Expected logs:**
```
Received 500000000 wZEC from company.your-account.testnet for company company.your-account.testnet
Deposit successful: 500000000 wZEC for company company.your-account.testnet
```

---

## Step 5: Add Employee to Payroll

```bash
# Note: In production, use the SDK to properly encrypt salary data
# For testing, we use mock encrypted data

near call $PAYROLL add_employee \
  '{
    "employee_id": "'$EMPLOYEE'",
    "encrypted_name": [65,108,105,99,101,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    "encrypted_salary": [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32],
    "salary_commitment": [100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100,100],
    "public_key": [50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50,50]
  }' \
  --accountId $OWNER \
  --deposit 0.1 \
  --networkId testnet

# Verify employee added
near view $PAYROLL get_employee \
  '{"employee_id": "'$EMPLOYEE'"}' \
  --networkId testnet
```

**Expected output:**
```json
{
  "id": "employee.your-account.testnet",
  "encrypted_name": [...],
  "encrypted_salary": [...],
  "salary_commitment": [...],
  "status": "Active",
  "joined_date": "1732900000000000000",
  "public_key": [...]
}
```

---

## Step 6: Fund Employee Balance

For testing withdrawals, we need to give the employee some balance. In production, this happens through `pay_employee` with ZK proofs. For testing, we can:

### Option A: Direct Balance Funding (Testing Only)

This requires modifying the contract to add a test method. Instead, use Option B.

### Option B: Simulate Payment (Mock Proof)

```bash
# Note: This will fail verification in production mode
# For full testing, you'd need to generate a real ZK proof

# For now, test the withdrawal validation logic directly
echo "⚠️  Payment with ZK proof requires proof generation"
echo "Skipping to withdrawal address validation testing..."
```

---

## Step 7: Test Withdrawal Address Validation

Even without employee balance, we can test that address validation works:

### 7.1 Test Valid Zcash Addresses

```bash
# This will fail due to insufficient balance, but we can check the error message
# to confirm address validation passed

# Test shielded address (zs1...)
near call $PAYROLL withdraw_via_intents \
  '{
    "amount": "100000000",
    "destination_chain": "Zcash",
    "destination_address": "zs1j29m7zdmh0s2k2c2fqjcpxlqm9uvr9q3r5xeqf4p0k5h8j3w2k8h5j3w2k8h5j3w2k8h5j3w2k8h5j3w2k8h5j3w2k8h5j3w2k"
  }' \
  --accountId $EMPLOYEE \
  --gas 300000000000000 \
  --networkId testnet
```

**Expected error:** `Insufficient balance` (not `Invalid address`)

### 7.2 Test Invalid Zcash Address

```bash
near call $PAYROLL withdraw_via_intents \
  '{
    "amount": "100000000",
    "destination_chain": "Zcash",
    "destination_address": "invalid_zcash_address"
  }' \
  --accountId $EMPLOYEE \
  --gas 300000000000000 \
  --networkId testnet
```

**Expected error:** `Invalid destination address format` or refund in ft_on_transfer

### 7.3 Test Other Chain Addresses

```bash
# Ethereum (should accept 0x-prefixed addresses)
# Solana (should accept base58 addresses)
# Bitcoin (should accept bc1 addresses)
```

---

## Step 8: Test NEAR → NEAR Withdrawal

This doesn't require cross-chain bridging, so we can test the full flow:

### 8.1 Give Employee Direct Balance (Alternative Method)

If the contract allows, or if you modify it for testing:

```bash
# Create recipient account
near create-account recipient.your-account.testnet \
  --masterAccount $OWNER \
  --initialBalance 1 \
  --networkId testnet

# Register recipient with wZEC
near call $WZEC storage_deposit \
  '{"account_id": "recipient.your-account.testnet"}' \
  --accountId $OWNER \
  --deposit 0.01 \
  --networkId testnet
```

### 8.2 Manually Transfer to Employee (Testing)

For testing, have owner transfer wZEC directly to employee:

```bash
# Register employee with wZEC
near call $WZEC storage_deposit \
  '{"account_id": "'$EMPLOYEE'"}' \
  --accountId $EMPLOYEE \
  --deposit 0.01 \
  --networkId testnet

# Owner transfers some wZEC to employee for testing
near call $WZEC ft_transfer \
  '{
    "receiver_id": "'$EMPLOYEE'",
    "amount": "200000000"
  }' \
  --accountId $COMPANY \
  --depositYocto 1 \
  --networkId testnet

# Verify employee has wZEC
near view $WZEC ft_balance_of \
  '{"account_id": "'$EMPLOYEE'"}' \
  --networkId testnet
# Expected: "200000000" (2 ZEC)
```

---

## Step 9: Query Contract State

### Payroll Contract

```bash
# Get company balance
near view $PAYROLL get_company_balance --networkId testnet

# Get employee info
near view $PAYROLL get_employee \
  '{"employee_id": "'$EMPLOYEE'"}' \
  --networkId testnet

# Get contract stats
near view $PAYROLL get_stats --networkId testnet

# Get intents adapter address
near view $PAYROLL get_intents_adapter --networkId testnet
```

### Intents Adapter

```bash
# Get owner
near view $INTENTS get_owner --networkId testnet

# Get payroll contract
near view $INTENTS get_payroll_contract --networkId testnet

# Get stats (deposits, withdrawals, nonce)
near view $INTENTS get_stats --networkId testnet

# Get chain config for Zcash
near view $INTENTS get_chain_config \
  '{"chain": "Zcash"}' \
  --networkId testnet

# Check if wZEC is supported
near view $INTENTS is_token_supported \
  '{"token": "'$WZEC'"}' \
  --networkId testnet

# Get authorized relayers
near view $INTENTS get_relayers --networkId testnet
```

### wZEC Token

```bash
# Get token metadata
near view $WZEC ft_metadata --networkId testnet

# Get total supply
near view $WZEC ft_total_supply --networkId testnet

# Get balance of any account
near view $WZEC ft_balance_of \
  '{"account_id": "'$COMPANY'"}' \
  --networkId testnet
```

---

## Step 10: Test Admin Operations

### Update Chain Configuration

```bash
# Disable Zcash deposits (testing)
near call $INTENTS update_chain_config \
  '{
    "config": {
      "chain": "Zcash",
      "deposit_enabled": false,
      "withdrawal_enabled": true,
      "min_withdrawal": "10000000",
      "max_withdrawal": "0",
      "fee_bps": 50,
      "bridge_address": "zcash-bridge.testnet"
    }
  }' \
  --accountId $OWNER \
  --networkId testnet

# Verify update
near view $INTENTS get_chain_config \
  '{"chain": "Zcash"}' \
  --networkId testnet
# deposit_enabled should be false

# Re-enable for testing
near call $INTENTS update_chain_config \
  '{
    "config": {
      "chain": "Zcash",
      "deposit_enabled": true,
      "withdrawal_enabled": true,
      "min_withdrawal": "10000000",
      "max_withdrawal": "0",
      "fee_bps": 50,
      "bridge_address": "zcash-bridge.testnet"
    }
  }' \
  --accountId $OWNER \
  --networkId testnet
```

### Manage Relayers

```bash
# Add new relayer
near call $INTENTS add_relayer \
  '{"relayer": "relayer.testnet"}' \
  --accountId $OWNER \
  --networkId testnet

# Verify added
near view $INTENTS get_relayers --networkId testnet
# Should include "relayer.testnet"

# Remove relayer
near call $INTENTS remove_relayer \
  '{"relayer": "relayer.testnet"}' \
  --accountId $OWNER \
  --networkId testnet

# Verify removed
near view $INTENTS get_relayers --networkId testnet
```

---

## Step 11: Test Access Control

### Non-Owner Cannot Update Config

```bash
# This should fail
near call $INTENTS update_chain_config \
  '{
    "config": {
      "chain": "Zcash",
      "deposit_enabled": false,
      "withdrawal_enabled": false,
      "min_withdrawal": "0",
      "max_withdrawal": "0",
      "fee_bps": 0,
      "bridge_address": ""
    }
  }' \
  --accountId $EMPLOYEE \
  --networkId testnet
```

**Expected error:** `Only owner can call this`

### Non-Relayer Cannot Confirm Deposits

```bash
# This should fail
near call $INTENTS confirm_cross_chain_deposit \
  '{
    "source_tx_hash": "fake_tx_123",
    "amount": "1000000",
    "company_id": "'$COMPANY'",
    "source_chain": "Zcash"
  }' \
  --accountId $EMPLOYEE \
  --networkId testnet
```

**Expected error:** `Not an authorized relayer`

---

## Step 12: Monitor Transaction Logs

View detailed logs for any transaction:

```bash
# Get recent transaction hash from any of the above calls
# Then view details:
near tx-status <TRANSACTION_HASH> --accountId $OWNER --networkId testnet

# Example for deposit:
near tx-status H7jxxx... --accountId $COMPANY --networkId testnet
```

Look for log entries like:
- `Received X wZEC from Y for company Z`
- `Deposit successful: X wZEC for company Y`
- `Withdrawal initiated: X wZEC from Y to Z on zcash`

---

## Expected Test Results Summary

| Test | Expected Result |
|------|----------------|
| Deploy contracts | ✅ All 4 contracts deployed |
| Company deposit | ✅ Balance increased in payroll |
| Add employee | ✅ Employee record created |
| Valid address | ✅ Accepted (or fails on balance) |
| Invalid address | ❌ Rejected with error |
| Non-owner admin call | ❌ Access denied |
| View methods | ✅ Return correct state |
| Chain configs | ✅ Default configs loaded |

---

## Troubleshooting

### Issue: "Account not found"

**Solution:** Ensure you created all test accounts:
```bash
near state your-account.testnet --networkId testnet
near state company.your-account.testnet --networkId testnet
near state employee.your-account.testnet --networkId testnet
```

### Issue: "Storage deposit required"

**Solution:** Register account with wZEC token:
```bash
near call $WZEC storage_deposit \
  '{"account_id": "<account>"}' \
  --accountId <account> \
  --deposit 0.01 \
  --networkId testnet
```

### Issue: "Contract not initialized"

**Solution:** Call the `new` initialization method on each contract after deployment.

### Issue: "Insufficient balance"

**Solution:** Mint wZEC for testing or fund the account properly.

---

## Cleanup

When done testing:

```bash
# Delete test subaccounts (optional, they're on testnet)
near delete-account $WZEC $OWNER --networkId testnet
near delete-account $VERIFIER $OWNER --networkId testnet
near delete-account $PAYROLL $OWNER --networkId testnet
near delete-account $INTENTS $OWNER --networkId testnet
near delete-account $COMPANY $OWNER --networkId testnet
near delete-account $EMPLOYEE $OWNER --networkId testnet
```

---

## Next Steps

After successful manual testing:

1. **Automated Testing**: Run integration tests via `cargo test`
2. **SDK Testing**: Use TypeScript SDK for programmatic testing
3. **Real Bridge Integration**: Connect to actual Zcash testnet bridge
4. **Mainnet Preparation**: Security audit before mainnet deployment

---

## Resources

- **Deployment Guide**: `docs/DEPLOYMENT_GUIDE.md`
- **Architecture**: `docs/CROSS_CHAIN_INTENTS.md`
- **Implementation Progress**: `docs/INTENTS_IMPLEMENTATION_PROGRESS.md`
- **NEAR CLI Docs**: https://docs.near.org/tools/near-cli
- **Testnet Explorer**: https://testnet.nearblocks.io
