# Mainnet Deployment Guide - NEAR Private Payroll with DeFi

**Version:** 1.0
**Date:** December 2, 2025
**Status:** Production Ready
**Network:** NEAR Mainnet Only

## Overview

This guide covers deploying NEAR Private Payroll with DeFi features (swap + auto-lend) to mainnet. **NEAR Intents protocol only exists on mainnet**, so these features cannot be fully tested on testnet.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Contract Deployment](#contract-deployment)
4. [NEAR Intents Configuration](#near-intents-configuration)
5. [Bridge Configuration](#bridge-configuration)
6. [Verification Keys Setup](#verification-keys-setup)
7. [Testing on Mainnet](#testing-on-mainnet)
8. [Frontend Deployment](#frontend-deployment)
9. [Monitoring and Maintenance](#monitoring-and-maintenance)
10. [Security Considerations](#security-considerations)

---

## Prerequisites

### 1. NEAR Mainnet Account

```bash
# Install NEAR CLI
npm install -g near-cli

# Set to mainnet
export NEAR_ENV=mainnet

# Check balance (need ~100 NEAR for deployment + operations)
near state your-company.near
```

**Minimum Requirements:**
- 50 NEAR for contract deployment
- 20 NEAR for storage staking
- 20 NEAR for initial operations/testing
- 10 NEAR buffer

### 2. Compiled Contracts

```bash
cd contracts/payroll
cargo near build --release

cd ../wzec-token
cargo near build --release

cd ../zk-verifier
cargo near build --release
```

**Output files:**
- `target/near/payroll_contract/payroll_contract.wasm`
- `target/near/wzec_token/wzec_token.wasm`
- `target/near/zk_verifier/zk_verifier.wasm`

### 3. Verification Keys

```bash
# Ensure ZK verification keys are generated
cd circuits/income-proof
cargo risczero build

# Keys will be in ~/.cargo/registry/.../risc0-groth16-*/keys/
```

---

## Pre-Deployment Checklist

### Contract Checklist

- [ ] All contracts compiled successfully
- [ ] Integration tests passing
- [ ] WASM sizes reasonable (<500KB each)
- [ ] Gas costs tested in sandbox
- [ ] No `todo!()` or `unimplemented!()` in code
- [ ] Security review completed (if using real funds)

### DeFi Configuration Checklist

- [ ] NEAR Intents contract address: `intents.near`
- [ ] PoA Bridge Zcash token: `zec.omft.near` (verify current address)
- [ ] Token list prepared for swap widget
- [ ] Lending protocol configurations documented
- [ ] Gas limits tested (300 TGas for cross-chain ops)

### Frontend Checklist

- [ ] SDK published to NPM (or local reference)
- [ ] Wallet selector configured for mainnet
- [ ] NEAR Intents widgets tested
- [ ] Error handling implemented
- [ ] Loading states for all async operations
- [ ] Environment variables for mainnet

---

## Contract Deployment

### Step 1: Deploy ZK Verifier Contract

```bash
# Deploy zk-verifier
near deploy \
  --accountId zk-verifier.your-company.near \
  --wasmFile target/near/zk_verifier/zk_verifier.wasm \
  --initFunction new \
  --initArgs '{}'

# Verify deployment
near view zk-verifier.your-company.near get_stats
```

**Expected Output:**
```json
{
  "total_verifications": 0,
  "total_successful": 0,
  "registered_image_ids": 0
}
```

### Step 2: Register RISC Zero Image IDs

```bash
# Register income-proof circuit
near call zk-verifier.your-company.near register_image_id \
  '{"image_id": "YOUR_INCOME_PROOF_IMAGE_ID"}' \
  --accountId your-company.near \
  --gas 50000000000000

# Register payment-proof circuit (if needed)
near call zk-verifier.your-company.near register_image_id \
  '{"image_id": "YOUR_PAYMENT_PROOF_IMAGE_ID"}' \
  --accountId your-company.near \
  --gas 50000000000000
```

**Get Image IDs from:**
```bash
# From compiled circuits
grep "IMAGE_ID" circuits/income-proof/target/release/build/*/out/methods.rs
```

### Step 3: Deploy wZEC Token Contract

```bash
# Deploy wZEC token
near deploy \
  --accountId wzec.your-company.near \
  --wasmFile target/near/wzec_token/wzec_token.wasm \
  --initFunction new \
  --initArgs '{
    "owner_id": "your-company.near",
    "total_supply": "0",
    "metadata": {
      "spec": "ft-1.0.0",
      "name": "Wrapped Zcash",
      "symbol": "wZEC",
      "icon": "data:image/svg+xml...",
      "decimals": 8
    }
  }'

# Verify deployment
near view wzec.your-company.near ft_metadata
```

### Step 4: Deploy Payroll Contract

```bash
# Deploy payroll contract
near deploy \
  --accountId payroll.your-company.near \
  --wasmFile target/near/payroll_contract/payroll_contract.wasm \
  --initFunction new \
  --initArgs '{
    "owner": "your-company.near",
    "wzec_token": "wzec.your-company.near",
    "zk_verifier": "zk-verifier.your-company.near"
  }'

# Verify deployment
near view payroll.your-company.near get_stats
```

**Expected Output:**
```json
[0, 0, "0"]  // [totalEmployees, totalPayments, companyBalance]
```

---

## NEAR Intents Configuration

### Step 5: Configure NEAR Intents

```bash
# Set NEAR Intents contract
near call payroll.your-company.near set_near_intents_contract \
  '{"near_intents": "intents.near"}' \
  --accountId your-company.near \
  --gas 10000000000000

# Verify configuration
near view payroll.your-company.near get_near_intents_contract
```

**Expected Output:**
```json
"intents.near"
```

**⚠️ Critical:**  `intents.near` is the production NEAR Intents contract. DO NOT use testnet addresses!

---

## Bridge Configuration

### Step 6: Configure PoA Bridge

**Find Current PoA Bridge Zcash Token:**
```bash
# Check NEAR Explorer for current PoA Bridge tokens
# As of Dec 2025, likely: zec.omft.near or zec.tokenfactory.near

# Verify token exists
near view zec.omft.near ft_metadata
```

**Configure in Contract:**
```bash
# Set PoA Bridge token
near call payroll.your-company.near set_poa_token \
  '{"poa_token": "zec.omft.near"}' \
  --accountId your-company.near \
  --gas 10000000000000

# Verify configuration
near view payroll.your-company.near get_poa_token
```

**Expected Output:**
```json
"zec.omft.near"
```

### Step 7: Configure Bridge Relayer (Optional)

If running your own Zcash bridge:

```bash
cd /path/to/near-private-payroll/relayer

# Configure for mainnet
export NEAR_NETWORK=mainnet
export NEAR_ACCOUNT=your-company.near
export ZEC_RPC_URL=https://mainnet.zcash.someprovider.com

# Update .env
cat > .env << EOF
NEAR_NETWORK=mainnet
NEAR_ACCOUNT_ID=your-company.near
NEAR_PRIVATE_KEY=ed25519:...
WZEC_CONTRACT=wzec.your-company.near
PAYROLL_CONTRACT=payroll.your-company.near
ZEC_RPC_URL=https://mainnet.zcash.provider.com
ZEC_RPC_USER=your-rpc-user
ZEC_RPC_PASSWORD=your-rpc-password
EOF

# Start relayer
npm start
```

---

## Verification Keys Setup

### Step 8: Upload VK to Contract

```bash
# Register verification key for income-proof
near call zk-verifier.your-company.near register_verification_key \
  '{
    "image_id": "YOUR_IMAGE_ID",
    "vk": {
      "alpha_g1": {...},
      "beta_g2": {...},
      "gamma_g2": {...},
      "delta_g2": {...},
      "ic": [...]
    }
  }' \
  --accountId your-company.near \
  --gas 100000000000000
```

**Get VK from:**
```bash
# From RISC Zero verifier.rs
cat ~/.cargo/registry/src/.../risc0-groth16-*/src/verifier.rs
```

---

## Testing on Mainnet

### Step 9: Small-Scale Testing

**⚠️ Test with small amounts first!**

**Test 1: Add Employee**
```bash
near call payroll.your-company.near add_employee \
  '{
    "employee_id": "test-employee.near",
    "encrypted_name": [1, 2, 3, 4],
    "encrypted_salary": [5, 6, 7, 8],
    "salary_commitment": [0, 0, ..., 0],
    "public_key": [0, 0, ..., 0]
  }' \
  --accountId your-company.near \
  --gas 50000000000000
```

**Test 2: Make Payment (0.01 ZEC)**
```bash
# First, deposit wZEC to contract
near call wzec.your-company.near ft_transfer_call \
  '{
    "receiver_id": "payroll.your-company.near",
    "amount": "1000000",
    "msg": "company_balance"
  }' \
  --accountId your-company.near \
  --depositYocto 1 \
  --gas 100000000000000

# Then pay employee
near call payroll.your-company.near pay_employee \
  '{
    "employee_id": "test-employee.near",
    "encrypted_amount": [1, 2, 3, 4],
    "payment_commitment": [0, 0, ..., 0],
    "period": "2025-12",
    "zk_proof": [...]
  }' \
  --accountId your-company.near \
  --gas 150000000000000
```

**Test 3: Configure Auto-Lend (as employee)**
```bash
near call payroll.your-company.near enable_auto_lend \
  '{
    "percentage": 10,
    "target_protocol": "aave",
    "target_chain": "Ethereum",
    "target_asset": "nep141:usdc.token.near"
  }' \
  --accountId test-employee.near \
  --gas 20000000000000
```

**Test 4: Small Swap (0.01 ZEC)**
```bash
near call payroll.your-company.near swap_balance \
  '{
    "amount": "1000000",
    "target_asset": "nep141:usdc.token.near",
    "target_chain": "Ethereum",
    "min_output": "28000000",
    "recipient": null
  }' \
  --accountId test-employee.near \
  --gas 300000000000000 \
  --depositYocto 1
```

---

## Frontend Deployment

### Step 10: Prepare Frontend for Mainnet

**Update `public/config.json`:**
```json
{
  "NETWORK_ID": "mainnet",
  "CONTRACT_ID": "payroll.your-company.near",
  "WZEC_CONTRACT": "wzec.your-company.near",
  "ZK_VERIFIER": "zk-verifier.your-company.near",
  "INTENTS_CONTRACT": "intents.near",
  "POA_TOKEN": "zec.omft.near"
}
```

**Build and Deploy:**
```bash
cd payroll-ui

# Build for production
npm run build

# Deploy to Vercel
vercel --prod

# Or deploy to IPFS
ipfs add -r dist/
```

**Update DNS:**
```bash
# Point your domain to deployment
# e.g., payroll.yourcompany.com
```

---

## Monitoring and Maintenance

### Step 11: Set Up Monitoring

**Monitor Contract Activity:**
```bash
# Watch contract events
near view payroll.your-company.near get_stats

# Check balances
near view payroll.your-company.near get_company_balance

# Monitor gas usage
near tx-status TRANSACTION_HASH --accountId your-company.near
```

**Set Up Alerts:**
- Low contract balance (<5 NEAR)
- Failed transactions spike
- Unusual swap/lend activity
- Bridge failures

**Logging:**
- Enable contract logs in NEAR Explorer
- Set up backend for transaction history
- Monitor NEAR Intents activity

### Step 12: Regular Maintenance Tasks

**Daily:**
- Check contract balance
- Verify bridge operations
- Monitor employee withdrawals

**Weekly:**
- Review gas costs
- Check DeFi yields
- Update token price data

**Monthly:**
- Contract health check
- Security audit logs
- Backup configuration data

---

## Security Considerations

### Access Control

**Owner Operations Only:**
- `add_employee`
- `register_trusted_verifier`
- `set_poa_token`
- `set_near_intents_contract`

**Employee Operations:**
- `withdraw`
- `swap_balance`
- `enable_auto_lend`
- `withdraw_lent_funds`

### Key Management

**Never:**
- Commit private keys to git
- Share keys in plaintext
- Use same key for multiple accounts

**Always:**
- Use hardware wallet for owner account
- Rotate keys regularly
- Keep backup keys in secure location
- Use multi-sig for high-value accounts

### Contract Upgrades

```bash
# Upgrade contract (preserves state)
near deploy \
  --accountId payroll.your-company.near \
  --wasmFile target/near/payroll_contract/payroll_contract.wasm

# Migrate if needed
near call payroll.your-company.near migrate \
  '{}' \
  --accountId your-company.near \
  --gas 300000000000000
```

---

## Troubleshooting

### Common Issues

**Issue: "NEAR Intents not configured"**
```bash
# Fix: Set intents contract
near call payroll.your-company.near set_near_intents_contract \
  '{"near_intents": "intents.near"}' \
  --accountId your-company.near
```

**Issue: Swap fails with "insufficient gas"**
```bash
# Fix: Increase gas to 300 TGas
--gas 300000000000000
```

**Issue: "PoA Bridge token not configured"**
```bash
# Fix: Set PoA token
near call payroll.your-company.near set_poa_token \
  '{"poa_token": "zec.omft.near"}' \
  --accountId your-company.near
```

---

## Cost Estimation

### Initial Deployment Costs

| Item | Cost (NEAR) | Notes |
|------|-------------|-------|
| ZK Verifier | ~5 NEAR | Deployment + storage |
| wZEC Token | ~5 NEAR | Deployment + storage |
| Payroll Contract | ~10 NEAR | Deployment + storage |
| VK Registration | ~5 NEAR | Per verification key |
| **Total** | **~25 NEAR** | One-time cost |

### Ongoing Operational Costs

| Operation | Cost | Frequency |
|-----------|------|-----------|
| Add Employee | 0.01 NEAR | Per employee |
| Pay Employee | 0.05 NEAR | Per payment |
| Swap | 0.03 NEAR + 0.4% | Per swap |
| Auto-Lend Config | 0.005 NEAR | Per change |
| Withdraw | 0.02 NEAR | Per withdrawal |

**Monthly Estimate (10 employees):**
- 10 payments: ~0.5 NEAR
- 5 swaps: ~0.15 NEAR
- 2 config changes: ~0.01 NEAR
- **Total: ~0.66 NEAR/month** (~$2-3 at current prices)

---

## Support and Resources

### NEAR Resources
- [NEAR Explorer](https://explorer.near.org)
- [NEAR CLI Docs](https://docs.near.org/tools/near-cli)
- [Contract Standards](https://nomicon.io/Standards/)

### NEAR Intents
- [Intents Protocol](https://intents.near.page)
- [Defuse Docs](https://docs.defuse.org)
- [Discord](https://discord.gg/defuse)

### Community
- [NEAR Discord](https://discord.gg/near)
- [Telegram](https://t.me/neardev)
- [Forum](https://forum.near.org)

---

## Post-Deployment Checklist

After successful mainnet deployment:

- [ ] All contracts deployed and initialized
- [ ] NEAR Intents configured (`intents.near`)
- [ ] PoA Bridge configured (`zec.omft.near`)
- [ ] Verification keys registered
- [ ] Small-scale testing completed successfully
- [ ] Frontend deployed and accessible
- [ ] Monitoring set up
- [ ] Documentation updated with contract addresses
- [ ] Team trained on operations
- [ ] Emergency procedures documented
- [ ] Backup/recovery plan in place

---

**Congratulations!** Your NEAR Private Payroll with DeFi features is now live on mainnet. 🎉

**Next Steps:**
1. Start with small test transactions
2. Gradually onboard employees
3. Monitor DeFi yields
4. Optimize based on usage patterns

---

*Generated with Claude Code - December 2, 2025*
