# Zcash ↔ NEAR Integration - Gap Analysis

**Date:** 2025-11-30
**Status:** Infrastructure Ready, Relayer Needs Updates

---

## Executive Summary

**What we have:**
- ✅ Zebra testnet node running (55% synced, RPC working)
- ✅ Zallet wallet built and configured (waiting for Zebra sync)
- ✅ Complete NEAR contracts (wZEC, intents-adapter, payroll)
- ✅ Bridge relayer architecture designed

**What's missing:**
- ❌ Relayer updated for Zebra/Zallet compatibility
- ❌ Custody address creation (blocked by Zallet sync)
- ❌ NEAR testnet deployment
- ❌ End-to-end testing

**Timeline:**
- ⏳ ~1-2 hours: Zebra finishes syncing
- 🔧 ~30 minutes: Update relayer code
- 🚀 ~1 hour: Deploy and test

---

## 1. Infrastructure Status

### Zcash Side ✅ READY (Pending Sync)

**Zebra Node:**
```bash
Status: Running at 127.0.0.1:18232
Sync: 55% complete (~1,871,600 / 3,400,000 blocks)
Network: Testnet
RPC: WORKING (tested with getblockchaininfo)
```

**Zallet Wallet:**
```bash
Status: Built, configured, running
RPC: NOT READY (waiting for Zebra sync)
Expected: Port 28232 will be available after Zebra reaches ~90%
Config: ~/.zallet/zallet.toml (network=test, RPC enabled)
```

**What works NOW:**
```bash
# Zebra RPC - Block data, network info
curl -s --user "__cookie__:COOKIE" \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"getblockchaininfo","params":[]}' \
  http://127.0.0.1:18232/
```

**What we're waiting for:**
```bash
# Zallet RPC - Wallet operations (blocked until Zebra synced)
curl -s --user "zcashrpc:testpass123" \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_listaccounts","params":[]}' \
  http://127.0.0.1:28232/
```

### NEAR Side ✅ CONTRACTS READY (Not Deployed)

**Contracts Ready for Deployment:**
- ✅ `contracts/wzec-token/` - NEP-141 token with bridge operations
- ✅ `contracts/intents-adapter/` - Cross-chain routing
- ✅ `contracts/payroll/` - Private payroll with ZK proofs

**Compilation Status:**
```bash
# All contracts compile successfully
cargo build --target wasm32-unknown-unknown --release

# Build outputs in target/wasm32-unknown-unknown/release/
- wzec_token.wasm
- intents_adapter.wasm
- payroll.wasm
- zk_verifier.wasm
```

**Deployment Scripts:**
- ✅ `scripts/build-all.sh` - Builds all contracts
- ✅ `scripts/deploy-testnet.sh` - Automated testnet deployment
- ✅ `docs/DEPLOYMENT_GUIDE.md` - Complete deployment instructions

---

## 2. Bridge Relayer Analysis

### Current Implementation (Outdated)

**File:** `bridge-relayer/relayer.js`

**Issues:**
1. **Uses zcashd RPC methods** - Now deprecated, replaced by Zallet
2. **Wrong RPC commands** - Needs Zallet-specific API
3. **Wrong port** - Configured for zcashd (18232), Zallet uses 28232
4. **Missing account UUID support** - Zallet uses UUID-based accounts, not address-based

### Specific Code Incompatibilities

#### Issue 1: RPC Connection
**Current (lines 39-65):**
```javascript
async function zcashRpc(method, params = []) {
  const response = await axios.post(ZCASH_RPC, {
    jsonrpc: '1.0',
    id: 'bridge-relayer',
    method,
    params
  }, {
    auth: {
      username: ZCASH_USER,    // Works with Zallet ✅
      password: ZCASH_PASS     // Works with Zallet ✅
    }
  });
}
```
**Status:** ✅ This part is compatible

#### Issue 2: Getting Custody Address Balance
**Current (line 249):**
```javascript
const balance = await zcashRpc('z_getbalance', [CUSTODY_ADDRESS]);
```

**Problem:** ❌ Zallet doesn't support `z_getbalance` with address parameter

**Zallet Equivalent:**
```javascript
// 1. Get account UUID first
const accounts = await zcashRpc('z_listaccounts');
const accountUuid = accounts[0].account_uuid;

// 2. Get balance for account
const balanceData = await zcashRpc('z_getbalanceforaccount', [accountUuid]);
const balance = balanceData.pools.sapling.valueZat / 100000000;
```

#### Issue 3: Monitoring Deposits
**Current (lines 144-147):**
```javascript
const received = await zcashRpc('z_listreceivedbyaddress', [
  CUSTODY_ADDRESS,
  1 // minconf
]);
```

**Problem:** ❌ Zallet doesn't have `z_listreceivedbyaddress`

**Zallet Equivalent:**
```javascript
// Use z_listunspent instead
const unspent = await zcashRpc('z_listunspent', [1, 9999999]);

// Filter for custody account
const accountAddresses = accounts[0].addresses.map(a => a.address);
const deposits = unspent.filter(tx =>
  accountAddresses.includes(tx.address) &&
  !state.processedTxids.includes(tx.txid)
);
```

#### Issue 4: Configuration
**Current (.env.example):**
```bash
ZCASH_RPC_PORT=18232              # ❌ WRONG - This is Zebra port
ZCASH_CUSTODY_ADDRESS=zs1...      # ❌ Need account UUID instead
```

**Should be:**
```bash
ZCASH_RPC_PORT=28232              # ✅ Zallet wallet RPC port
ZCASH_CUSTODY_ACCOUNT_UUID=...    # ✅ Use account UUID
```

---

## 3. Required Relayer Updates

### Changes Needed

**File:** `bridge-relayer/relayer.js`

#### Update 1: Configuration (lines 16-19)
```javascript
// OLD:
const ZCASH_RPC = `http://${process.env.ZCASH_RPC_HOST}:${process.env.ZCASH_RPC_PORT}`;
const CUSTODY_ADDRESS = process.env.ZCASH_CUSTODY_ADDRESS;

// NEW:
const ZCASH_RPC = `http://${process.env.ZCASH_RPC_HOST}:28232`; // Zallet port
const CUSTODY_ACCOUNT_UUID = process.env.ZCASH_CUSTODY_ACCOUNT_UUID;
```

#### Update 2: Add Account Management (new function)
```javascript
/**
 * Get custody account details
 */
async function getCustodyAccount() {
  const accounts = await zcashRpc('z_listaccounts');

  // Find account by UUID or use first account
  if (CUSTODY_ACCOUNT_UUID) {
    return accounts.find(a => a.account_uuid === CUSTODY_ACCOUNT_UUID);
  }

  return accounts[0]; // Use first account for testing
}
```

#### Update 3: Update Balance Check (line 249)
```javascript
// OLD:
const balance = await zcashRpc('z_getbalance', [CUSTODY_ADDRESS]);

// NEW:
const account = await getCustodyAccount();
const balanceData = await zcashRpc('z_getbalanceforaccount', [account.account_uuid]);
const balance = balanceData.pools.sapling.valueZat / 100000000;
```

#### Update 4: Rewrite Deposit Monitoring (lines 136-204)
```javascript
async function monitorDeposits(nearAccount) {
  try {
    const currentBlock = await zcashRpc('getblockcount');

    if (currentBlock > state.lastProcessedBlock) {
      console.log(`New Zcash blocks: ${state.lastProcessedBlock} → ${currentBlock}`);

      // Get custody account
      const account = await getCustodyAccount();

      // Get all unspent outputs
      const unspent = await zcashRpc('z_listunspent', [1, 9999999]);

      // Get account addresses
      const accountAddresses = account.addresses.map(addr => addr.address);

      // Filter for deposits to our account
      const deposits = unspent.filter(tx =>
        accountAddresses.includes(tx.address) &&
        !state.processedTxids.includes(tx.txid)
      );

      for (const tx of deposits) {
        console.log('\n🔔 New deposit detected!');
        console.log('  Txid:', tx.txid);
        console.log('  Amount:', tx.value, 'ZEC');
        console.log('  Memo:', tx.memo || '(none)');

        // Parse company ID from memo
        const companyId = parseCompanyId(tx.memo);
        const receiverId = companyId || 'default.testnet';

        console.log('  Receiver:', receiverId);

        // Convert to smallest unit (8 decimals)
        const amount = Math.floor(tx.value * 100000000).toString();

        try {
          // Mint wZEC on NEAR
          console.log(`  Minting ${amount} wZEC units...`);

          const result = await nearAccount.functionCall({
            contractId: WZEC_CONTRACT,
            methodName: 'mint',
            args: {
              receiver_id: receiverId,
              amount: amount,
              zcash_tx_hash: tx.txid
            },
            gas: '50000000000000',
            attachedDeposit: '1'
          });

          console.log('  ✅ Minted successfully!');
          console.log('  NEAR tx:', result.transaction.hash);

          // Mark as processed
          state.processedTxids.push(tx.txid);
          saveState();

        } catch (error) {
          console.error('  ❌ Minting failed:', error.message);
        }
      }

      state.lastProcessedBlock = currentBlock;
      saveState();
    }

  } catch (error) {
    console.error('Error monitoring deposits:', error.message);
  }
}
```

#### Update 5: .env.example
```bash
# Zcash Configuration
ZCASH_RPC_HOST=127.0.0.1
ZCASH_RPC_PORT=28232                                    # CHANGED: Zallet wallet RPC
ZCASH_RPC_USER=zcashrpc
ZCASH_RPC_PASSWORD=testpass123
ZCASH_CUSTODY_ACCOUNT_UUID=                            # CHANGED: Use UUID instead of address
# Optional: If not set, will use first account

# NEAR Configuration
NEAR_NETWORK=testnet
NEAR_RELAYER_ACCOUNT=relayer.your-account.testnet
WZEC_CONTRACT=wzec.your-account.testnet
INTENTS_ADAPTER=intents.your-account.testnet

# Polling interval in milliseconds
POLL_INTERVAL=30000
```

---

## 4. Missing Components

### 1. Custody Address Creation ⏳ BLOCKED

**Status:** Waiting for Zallet wallet RPC to be available (Zebra needs to finish syncing)

**Once Zallet Ready:**
```bash
# 1. Get account UUID
UUID=$(curl -s --user "zcashrpc:testpass123" \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_listaccounts","params":[]}' \
  http://127.0.0.1:28232/ | jq -r '.result[0].account_uuid')

# 2. Get shielded address for custody
CUSTODY_ADDR=$(curl -s --user "zcashrpc:testpass123" \
  --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"1\",\"method\":\"z_getaddressforaccount\",\"params\":[\"$UUID\",[\"sapling\"]]}" \
  http://127.0.0.1:28232/ | jq -r '.result.address')

echo "Custody address: $CUSTODY_ADDR"
echo "Account UUID: $UUID"

# Add UUID to .env:
# ZCASH_CUSTODY_ACCOUNT_UUID=$UUID
```

### 2. Testnet ZEC Funding ⏳ BLOCKED

**Status:** Blocked by custody address creation

**Once Address Available:**
1. Visit Zcash testnet faucet: https://faucet.testnet.z.cash/
2. Request testnet ZEC to custody address
3. Wait for confirmation (~2-3 minutes)
4. Verify balance:
```bash
curl -s --user "zcashrpc:testpass123" \
  --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"1\",\"method\":\"z_getbalanceforaccount\",\"params\":[\"$UUID\"]}" \
  http://127.0.0.1:28232/ | jq '.result.pools.sapling.valueZat'
```

### 3. NEAR Testnet Deployment 🚧 CAN START NOW

**Status:** Ready to deploy anytime (independent of Zcash sync)

**Commands:**
```bash
# Build all contracts
./scripts/build-all.sh

# Deploy to testnet (replace YOUR_ACCOUNT with your testnet account)
./scripts/deploy-testnet.sh YOUR_ACCOUNT.testnet

# Output: deployment-testnet-{timestamp}.json with all contract addresses
```

**Contract Addresses Needed:**
- wZEC token contract
- Intents adapter contract
- (Optional: Payroll contract, verifier contract)

**Add to relayer .env:**
```bash
WZEC_CONTRACT=wzec-1234567890.YOUR_ACCOUNT.testnet
INTENTS_ADAPTER=intents-1234567890.YOUR_ACCOUNT.testnet
```

### 4. Relayer Implementation Updates 🔧 CAN START NOW

**Status:** Code changes can be made immediately (testing blocked by Zallet sync)

**Tasks:**
- [ ] Update `bridge-relayer/relayer.js` with Zallet-compatible code (see Section 3)
- [ ] Update `bridge-relayer/.env.example` with correct configuration
- [ ] Update `bridge-relayer/README.md` with Zallet instructions
- [ ] Install dependencies: `cd bridge-relayer && npm install`

### 5. Withdrawal Processing ❌ NOT IMPLEMENTED

**Status:** Architecture designed, code not written

**What Exists:**
- `contracts/intents-adapter/` emits withdrawal events
- `bridge-relayer/relayer.js` has placeholder `monitorWithdrawals()` (line 209)

**What's Needed:**
```javascript
async function monitorWithdrawals(nearAccount) {
  // 1. Query intents adapter for pending withdrawals
  const pendingWithdrawals = await nearAccount.viewFunction({
    contractId: INTENTS_ADAPTER,
    methodName: 'get_pending_withdrawals',
    args: {}
  });

  // 2. For each withdrawal:
  for (const withdrawal of pendingWithdrawals) {
    // - Get destination Zcash address
    // - Get amount to send
    // - Send ZEC from custody account
    const opid = await zcashRpc('z_sendmany', [
      custodyAddress,
      [{
        address: withdrawal.destination_address,
        amount: withdrawal.amount / 100000000
      }],
      null, // minconf
      null  // fee (automatic)
    ]);

    // - Wait for operation completion
    await waitForZcashOperation(opid);

    // - Confirm on NEAR
    await nearAccount.functionCall({
      contractId: INTENTS_ADAPTER,
      methodName: 'confirm_withdrawal_complete',
      args: {
        withdrawal_id: withdrawal.id,
        zcash_tx_hash: txid
      }
    });
  }
}
```

---

## 5. Testing Checklist

### Phase 1: Infrastructure ✅ IN PROGRESS
- [x] Zebra testnet node running
- [x] Zebra RPC accessible
- [ ] Zebra sync completed (~90%+)
- [x] Zallet wallet built
- [x] Zallet configured for testnet
- [ ] Zallet RPC accessible (blocked by Zebra sync)

### Phase 2: Setup ⏳ WAITING
- [ ] Custody account UUID obtained
- [ ] Custody address generated
- [ ] Testnet ZEC received from faucet
- [ ] Custody balance verified
- [ ] NEAR contracts deployed to testnet
- [ ] Relayer code updated for Zallet
- [ ] Relayer dependencies installed

### Phase 3: Deposit Flow Testing ⏳ WAITING
- [ ] Relayer started and connected
- [ ] Test deposit sent with memo
- [ ] Relayer detects deposit
- [ ] wZEC minted on NEAR
- [ ] Balance verified on NEAR
- [ ] Transaction hash recorded

### Phase 4: Withdrawal Flow Testing ❌ NOT READY
- [ ] Withdrawal processing code written
- [ ] Employee initiates withdrawal via NEAR
- [ ] Relayer detects withdrawal event
- [ ] ZEC sent from custody to destination
- [ ] Withdrawal confirmed on NEAR
- [ ] Balance deducted on NEAR

### Phase 5: End-to-End Testing ❌ NOT READY
- [ ] Complete deposit → payroll → withdrawal cycle
- [ ] Multiple deposits with different memos
- [ ] Error handling (invalid address, insufficient funds)
- [ ] Relayer restart with state recovery
- [ ] Load testing (multiple concurrent operations)

---

## 6. Timeline & Dependencies

### Current Blockers

**PRIMARY BLOCKER:** Zebra blockchain sync
- **Current:** 55% (~1,871,600 blocks)
- **Needed:** 90%+ (~3,060,000 blocks)
- **Time:** ~1-2 hours at current sync speed

**Dependency Chain:**
```
Zebra Sync (90%+)
    ↓
Zallet Wallet RPC Available
    ↓
Create Custody Address
    ↓
Get Testnet ZEC
    ↓
Test Deposit Flow
```

### What Can Be Done NOW (In Parallel)

1. ✅ **Deploy NEAR contracts** - Independent of Zcash
   ```bash
   ./scripts/build-all.sh
   ./scripts/deploy-testnet.sh YOUR_ACCOUNT.testnet
   ```

2. ✅ **Update relayer code** - Can code and test logic
   - Update `bridge-relayer/relayer.js` (Section 3 changes)
   - Update `bridge-relayer/.env.example`
   - Update `bridge-relayer/README.md`

3. ✅ **Prepare documentation** - Write testing procedures
   - End-to-end test script
   - Troubleshooting guide
   - Deployment checklist

### Estimated Timeline

**Once Zebra Synced (T+0):**
- T+0: Zebra sync completes
- T+5min: Zallet wallet RPC becomes available
- T+10min: Create custody address, get testnet ZEC
- T+15min: Deploy NEAR contracts (if not done already)
- T+20min: Configure and start relayer
- T+25min: Send test deposit
- T+30min: Verify wZEC minted (first deposit!)
- T+1hr: Implement withdrawal processing
- T+2hr: End-to-end testing complete

---

## 7. Summary

### What We Have ✅

**Infrastructure:**
- Zebra testnet node (working, syncing)
- Zallet wallet (built, configured)
- Complete NEAR contracts (compiled)
- Bridge relayer architecture

**Documentation:**
- `docs/ZCASH_SETUP.md` - Complete Zebra/Zallet setup
- `docs/ZCASH_RPC_REFERENCE.md` - All Zallet RPC commands
- `ZCASH_COMMAND_REFERENCE.md` - Quick command reference
- `scripts/test-zallet-commands.sh` - Automated RPC testing
- `docs/DEPLOYMENT_GUIDE.md` - NEAR deployment guide

### What's Missing ❌

**Code Updates:**
- Bridge relayer Zallet compatibility (30 min work)
- Withdrawal processing implementation (1-2 hours work)

**Setup Tasks (Blocked by Zebra Sync):**
- Custody address creation
- Testnet ZEC funding
- End-to-end testing

**Optional (Not Blocking):**
- NEAR testnet deployment (can do anytime)
- Relayer monitoring dashboard
- Multi-sig custody address
- Production security hardening

### Next Steps (In Order)

1. ⏳ **Wait for Zebra** - Currently 55%, need 90%+ (~1-2 hours)

2. 🔧 **Update relayer code** (can start now):
   - Apply changes from Section 3
   - Update documentation
   - Install dependencies

3. 🚀 **Deploy NEAR contracts** (can start now):
   ```bash
   ./scripts/deploy-testnet.sh YOUR_ACCOUNT.testnet
   ```

4. 🧪 **Once Zebra synced** - Test deposit flow:
   - Create custody address
   - Get testnet ZEC
   - Start relayer
   - Send test deposit
   - Verify wZEC minted

5. 🎯 **Implement withdrawals**:
   - Code withdrawal monitoring
   - Test withdrawal flow
   - End-to-end testing

---

## References

- **Zcash Setup:** `docs/ZCASH_SETUP.md`
- **Zcash RPC:** `docs/ZCASH_RPC_REFERENCE.md`
- **Quick Commands:** `ZCASH_COMMAND_REFERENCE.md`
- **NEAR Deployment:** `docs/DEPLOYMENT_GUIDE.md`
- **Bridge Architecture:** `docs/CROSS_CHAIN_INTENTS.md`
- **Intents Progress:** `docs/INTENTS_IMPLEMENTATION_PROGRESS.md`

**Zallet Documentation:**
- Official Docs: https://zcash.github.io/wallet/
- RPC Reference: https://zcash.github.io/wallet/zcashd/json_rpc.html
- CLI Guide: https://zcash.github.io/wallet/cli/index.html

**NEAR Documentation:**
- NEAR API JS: https://docs.near.org/tools/near-api-js
- Testnet Faucet: https://near-faucet.io/
- Explorer: https://testnet.nearblocks.io/

---

**Last Updated:** 2025-11-30
**Zebra Sync Status:** 55% (updating in real-time)
**Ready to Deploy:** NEAR contracts only
**Ready to Code:** Relayer updates (testing blocked)
