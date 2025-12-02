# NEAR Private Payroll - Bridge Architecture

**Last Updated:** 2025-12-01
**Status:** Infrastructure Ready, Withdrawal Handler Needs Implementation
**wZEC Contract:** `wzec-token2.testnet` (Deployed ✅)

---

## Table of Contents

1. [Current Implementation Status](#1-current-implementation-status)
2. [Architecture Overview](#2-architecture-overview)
3. [Component Overview](#3-component-overview)
4. [Deposit Flow (Zcash → NEAR)](#4-deposit-flow-zcash--near)
5. [Withdrawal Flow (NEAR → Zcash)](#5-withdrawal-flow-near--zcash)
6. [Bridge Relayer API Reference](#6-bridge-relayer-api-reference)
7. [Configuration](#7-configuration)
8. [Testing & Deployment](#8-testing--deployment)
9. [Next Steps](#9-next-steps)

---

## 1. Current Implementation Status

### ✅ Completed Components

| Component | Status | Details |
|-----------|--------|---------|
| **wZEC Token Contract** | ✅ Deployed | `wzec-token2.testnet` on NEAR testnet |
| **Zcash Wallet (zcashd)** | ✅ Ready | Syncing blockchain, RPC at `127.0.0.1:8233` |
| **Zebra Node** | ✅ Running | Testnet node for Zallet, RPC at `127.0.0.1:18232` |
| **Zallet Wallet** | ✅ Available | Alternative wallet, RPC at `127.0.0.1:28232` |
| **zcashd-cli Tool** | ✅ Ready | CLI wrapper for zcashd operations |
| **zcash-cli Tool** | ✅ Ready | CLI wrapper for Zallet operations |
| **Bridge Relayer** | ✅ TypeScript | Deposit monitoring implemented |

### ⏳ Partially Implemented Components

| Component | Status | Priority |
|-----------|--------|----------|
| **Withdrawal Handler** | ⚠️ Implemented (needs testing) | **HIGH** |
| **Intents Adapter Deployment** | ❌ Not Deployed | **MEDIUM** |
| **End-to-End Testing** | ❌ Not Started | **HIGH** |

---

## 2. Architecture Overview

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    NEAR Private Payroll Bridge                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐                              ┌──────────────┐     │
│  │   Zcash      │                              │    NEAR      │     │
│  │   Testnet    │                              │   Testnet    │     │
│  │              │                              │              │     │
│  │  ┌────────┐  │    DEPOSITS (ZEC → wZEC)    │  ┌────────┐  │     │
│  │  │Shielded│──┼──────────────────────────────▶│  wZEC  │  │     │
│  │  │Address │  │                              │  Token │  │     │
│  │  │(zs1...)│  │                              │        │  │     │
│  │  └────────┘  │                              │  └────┬───┘  │     │
│  │      ▲       │                              │       │      │     │
│  │      │       │                              │       ▼      │     │
│  │      │       │  WITHDRAWALS (wZEC → ZEC)   │  ┌─────────┐ │     │
│  │  ┌────────┐  │◀──────────────────────────────│  Burn   │ │     │
│  │  │ zcashd │  │                              │  Event  │ │     │
│  │  │ Wallet │  │                              │         │ │     │
│  │  └────────┘  │                              │  └─────┬─┘ │     │
│  │              │                              │        │   │     │
│  └──────────────┘                              └────────┼───┘     │
│         ▲                                               │         │
│         │                                               │         │
│         │         ┌──────────────────┐                 │         │
│         └─────────│ Bridge Relayer   │─────────────────┘         │
│                   │  (TypeScript)    │                           │
│                   │                  │                           │
│                   │ - Monitors ZEC   │                           │
│                   │ - Mints wZEC     │                           │
│                   │ - Processes      │                           │
│                   │   Withdrawals    │                           │
│                   └──────────────────┘                           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Zcash Node** | Zebra v2.0+ (optional) | Syncs Zcash testnet for Zallet |
| **Zcash Wallet** | zcashd v5.4.2 | Manages keys, signs transactions |
| **Bridge Relayer** | TypeScript + Node.js | Monitors chains, executes operations |
| **NEAR Contracts** | Rust (near-sdk 5.5) | wZEC token, payroll |
| **Communication** | JSON-RPC | Zcash & NEAR RPC calls |

---

## 3. Component Overview

### 3.1 Zcash Components

#### zcashd Wallet
- **Role:** Zcash full node with built-in wallet (production-grade)
- **Port:** `8233` (custom RPC port to avoid conflict with Zebra)
- **Features:** Account management, shielded transactions, memo support
- **Status:** Syncing blockchain (needs time to sync ~3.2M testnet blocks)
- **Address:** `ztestsapling1ydr32a678tr6lcgmxhvqcekk7tg0ekmt7hhzkcj0rjw84qe3ha5rwd989hxz4w5kqy9rw6ka6cj`

#### zcashd-cli Tool
- **Role:** Command-line wrapper for zcashd RPC
- **Location:** `bridge-relayer/scripts/zcashd-cli.ts`
- **Usage:**
  ```bash
  npm run zcashd-cli info
  npm run zcashd-cli balance
  npm run zcashd-cli addresses
  npm run zcashd-cli send <address> <amount> [from] [memo]
  npm run zcashd-cli status <opid>
  ```

#### Monitoring Script
- **Location:** `bridge-relayer/scripts/monitor-zcashd.sh`
- **Usage:** `./bridge-relayer/scripts/monitor-zcashd.sh`
- **Purpose:** Real-time sync progress monitoring

#### Zebra Node (Optional/Backup)
- **Role:** Alternative Zcash node for Zallet wallet
- **Port:** `18232` (RPC), `18233` (P2P)
- **Status:** Available if needed, runs in Docker
- **Note:** Currently using zcashd instead

#### Zallet Wallet (Optional/Backup)
- **Role:** Official new Zcash wallet (alpha)
- **Port:** `28232` (Wallet RPC)
- **Status:** Available but has alpha limitations
- **Note:** Currently using zcashd instead

### 3.2 NEAR Components

#### wZEC Token Contract
- **Contract ID:** `wzec-token2.testnet` ✅ Deployed
- **Standard:** NEP-141 (Fungible Token)
- **Decimals:** 8 (matches ZEC)
- **Features:**
  - Bridge mint/burn operations
  - Zcash transaction hash tracking
  - Storage deposit management
- **Location:** `contracts/wzec-token/`

**Key Methods:**
```rust
// Mint wZEC (bridge relayer only)
pub fn mint(receiver_id: AccountId, amount: U128, zcash_tx_hash: String)

// Burn wZEC for withdrawal
pub fn burn(amount: U128, destination_address: String)

// Standard NEP-141
pub fn ft_transfer(receiver_id: AccountId, amount: U128, memo: Option<String>)
```

### 3.3 Bridge Relayer

- **Language:** TypeScript (Node.js)
- **Location:** `bridge-relayer/src/`
- **Role:** Off-chain service monitoring both chains

**Current Implementation:**
- ✅ Monitors Zcash deposits to custody address (using Zallet)
- ✅ Mints wZEC on NEAR when deposits confirmed
- ✅ Parses company ID from transaction memos
- ✅ Dual wallet support: Zallet (deposits) + zcashd (withdrawals)
- ✅ Monitors NEAR for Burn events
- ✅ Sends ZEC on Zcash when withdrawals detected (using zcashd)
- ⏳ End-to-end testing needed

---

## 4. Deposit Flow (Zcash → NEAR)

### Step-by-Step Process

```
┌──────────────┐
│  Company     │ Sends ZEC to custody address with memo
└──────┬───────┘
       │ Zcash shielded transaction
       │ Memo: "company:your-account.testnet"
       ▼
┌──────────────────┐
│ Custody Address  │ ztestsapling1... (shielded Sapling address)
│ (zcashd Wallet)  │
└──────┬───────────┘
       │
       │ Zcash network confirms (1-3 blocks)
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ Bridge Relayer (ZcashService.getNewDeposits)               │
│                                                             │
│ 1. Poll Zcash RPC every 30s:                               │
│    - z_listunspent() → unspent outputs                     │
│                                                             │
│ 2. Filter for custody account addresses                    │
│    - Skip already processed txids                          │
│                                                             │
│ 3. For each new deposit:                                   │
│    - Parse memo for company ID                             │
│    - Convert amount to 8-decimal units                     │
│    - Call NEAR: wzec.mint()                                │
└─────────────────────────────────────────────────────────────┘
       │
       │ NEAR transaction
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ wZEC Contract (mint)                                        │
│                                                             │
│ - Validates caller is authorized relayer                   │
│ - Mints amount to receiver_id (from memo)                  │
│ - Records zcash_tx_hash for audit trail                    │
│ - Emits FtMint event                                       │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────┐
│  Company     │ Receives wZEC on NEAR
│  Balance     │ Can now pay employees
└──────────────┘
```

---

## 5. Withdrawal Flow (NEAR → Zcash)

### Overview

Employee burns wZEC → Relayer detects Burn event → Sends ZEC on Zcash.

### Step-by-Step Process

```
┌──────────────┐
│  Employee    │ Calls burn_for_zcash(amount, "ztestsapling1...")
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ wZEC Contract (burn_for_zcash)                              │
│                                                             │
│ - Burns wZEC from caller's balance                         │
│ - Emits BurnForZcashEvent with destination address         │
│ - Event includes: burner, amount, address, nonce           │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ Bridge Relayer (monitorWithdrawals) ✅ IMPLEMENTED         │
│                                                             │
│ 1. Monitor NEAR for BurnForZcashEvent logs                 │
│    - Poll every 30 seconds (configurable)                  │
│    - Track processed nonces to avoid duplicates            │
│                                                             │
│ 2. For each new burn event:                                │
│    - Parse withdrawal details (address, amount, nonce)     │
│    - Get custody address from zcashd                       │
│    - Call zcashd z_sendmany to send ZEC                    │
│    - Wait for operation completion (~60s timeout)          │
│                                                             │
│ 3. Record successful withdrawal                            │
│    - Save nonce to prevent replay                          │
│    - Log Zcash txid for audit trail                        │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────┐
│ Zcash Network    │ Employee receives ZEC in shielded address
└──────────────────┘
```

---

## 6. Bridge Relayer API Reference

### Environment Variables

```bash
# Zcash Configuration (Zallet - for deposits)
ZCASH_RPC_HOST=127.0.0.1
ZCASH_RPC_PORT=28232
ZCASH_RPC_USER=zcashrpc
ZCASH_RPC_PASSWORD=testpass123
ZCASH_CUSTODY_ACCOUNT_UUID=  # Optional

# Zcashd Configuration (for withdrawals) - OPTIONAL
ZCASHD_ENABLED=true  # Set to true to enable withdrawal processing
ZCASHD_RPC_HOST=127.0.0.1
ZCASHD_RPC_PORT=8233
ZCASHD_RPC_USER=zcashuser
ZCASHD_RPC_PASSWORD=zcashpass123

# NEAR Configuration
NEAR_NETWORK=testnet
NEAR_RELAYER_ACCOUNT=relayer.testnet
WZEC_CONTRACT=wzec-token2.testnet
INTENTS_ADAPTER=intents.testnet

# Polling Configuration
POLL_INTERVAL=30000  # Deposit monitoring (30 seconds)
WITHDRAWAL_POLL_INTERVAL=30000  # Withdrawal monitoring (optional, defaults to POLL_INTERVAL)
```

### Core Services

#### ZcashService (Zallet)
Manages Zallet wallet operations for deposit monitoring.

**Methods:**
- `getCustodyAccount()` - Get custody account details
- `getCustodyAddresses()` - List custody addresses
- `getNewDeposits(minConfirmations, processedTxids)` - Get new deposits

#### ZcashdService
Manages zcashd wallet operations for withdrawals.

**Methods:**
- `getCustodyAddress()` - Get first shielded address from zcashd wallet
- `sendZec(fromAddress, toAddress, amount)` - Send ZEC to destination
- `waitForOperation(opid, maxRetries)` - Wait for z_sendmany operation
- `getTotalBalance()` - Get total shielded balance
- `getBlockchainInfo()` - Get sync status

#### NearService
Manages NEAR contract interactions.

**Methods:**
- `mintForDeposit(deposit)` - Mint wZEC on NEAR for a deposit
- `getNewWithdrawals(processedNonces)` - Query for new burn events (withdrawals)

---

## 7. Configuration

### 7.1 Zcash Setup (zcashd)

**Installation:** Already complete ✅

**Configuration:** `/Users/norman/Library/Application Support/Zcash/zcash.conf`

```ini
testnet=1
addnode=testnet.z.cash
port=18234
rpcuser=zcashuser
rpcpassword=zcashpass123
rpcport=8233
server=1
allowdeprecated=z_getnewaddress
walletrequirebackup=false
```

**Monitor Sync Progress:**
```bash
~/Development/NEAR/near-private-payroll/bridge-relayer/scripts/monitor-zcashd.sh
```

### 7.2 Bridge Relayer Setup

```bash
cd bridge-relayer

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your values

# Run relayer
npm run dev
```

---

## 8. Testing & Deployment

### 8.1 Test Deposit Flow (Once zcashd Syncs)

```bash
# 1. Request testnet ZEC from faucet
# Visit: https://testnet.zecfaucet.com
# Send to: ztestsapling1ydr32a678tr6lcgmxhvqcekk7tg0ekmt7hhzkcj0rjw84qe3ha5rwd989hxz4w5kqy9rw6ka6cj

# 2. Get bridge custody address
npm run zcash-cli addresses

# 3. Send test deposit with memo
CUSTODY="<custody_address>"
MEMO=$(echo -n "company:your-account.testnet" | xxd -p | tr -d '\n')

npm run zcashd-cli send "$CUSTODY" 0.01 "" "$MEMO"

# 4. Watch relayer logs
npm run dev

# 5. Verify wZEC minted
near view wzec-token2.testnet ft_balance_of \
  '{"account_id": "your-account.testnet"}' \
  --networkId testnet
```

---

## 9. Next Steps

### Priority 1: Test Withdrawal Handler ⭐

**Status:** Implementation complete, needs testing

**Testing Checklist:**
1. ✅ zcashd syncing (monitor with `monitor-zcashd.sh`)
2. ⏳ Enable zcashd in relayer config (`ZCASHD_ENABLED=true`)
3. ⏳ Start relayer and verify zcashd connection
4. ⏳ Manually test burn_for_zcash on NEAR testnet
5. ⏳ Verify relayer detects burn event and sends ZEC
6. ⏳ Confirm ZEC arrives at destination address

**Testing Commands:**
```bash
# 1. Check zcashd sync status
~/Development/NEAR/near-private-payroll/bridge-relayer/scripts/monitor-zcashd.sh

# 2. Configure .env (once zcashd syncs)
cd bridge-relayer
cp .env.example .env
# Edit .env: Set ZCASHD_ENABLED=true, add credentials

# 3. Start relayer
npm run dev

# 4. Test withdrawal (in NEAR CLI)
near call wzec-token2.testnet burn_for_zcash \
  '{"amount": "100000", "zcash_shielded_address": "ztestsapling1..."}' \
  --accountId employee.testnet
```

### Priority 2: Test Complete Flow

Once zcashd fully syncs:
1. ✅ Test deposit with memo (already working)
2. ⏳ Test withdrawal (after zcashd syncs)
3. ⏳ Test error handling (invalid addresses, insufficient balance)
4. ⏳ Test memo parsing variations
5. ⏳ Test duplicate prevention (nonce tracking)

### Priority 3: Production Hardening

- Replace polling with NEAR Lake indexer for real-time withdrawal detection
- Add persistent database for transaction tracking (PostgreSQL)
- Implement withdrawal queue and retry logic
- Add monitoring/alerting (Prometheus/Grafana)
- Security audit (custody keys, replay prevention)
- Add logging and error reporting (Sentry)

---

**Status:** ✅ Withdrawal handler implemented, ⏳ waiting for zcashd sync to test
**Zcashd Sync:** In progress (monitor with `monitor-zcashd.sh`)
**Next Session:** Test complete withdrawal flow once zcashd syncs
