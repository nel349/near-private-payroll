# Zcash ↔ NEAR Bridge Relayer (TypeScript)

Elegant TypeScript bridge relayer for Zcash testnet (via Zallet) to NEAR testnet.

## Architecture

```
┌─────────────────────────────────────┐
│  src/                               │
│  ├── index.ts          (Entry point)│
│  ├── config.ts         (Config loader)│
│  ├── types.ts          (Type definitions)│
│  ├── relayer.ts        (Main orchestrator)│
│  └── services/                      │
│      ├── zcash.service.ts (Zallet RPC)│
│      ├── near.service.ts  (wZEC SDK) │
│      └── state.service.ts (Persistence)│
└─────────────────────────────────────┘
```

## Features

- ✅ **Type-safe** - Full TypeScript with strict mode
- ✅ **Clean architecture** - Separation of concerns with service classes
- ✅ **Zallet compatible** - Uses modern Zallet RPC (account UUID model)
- ✅ **SDK integration** - Reuses existing NEAR SDK types
- ✅ **State management** - Persistent state across restarts
- ✅ **Error handling** - Comprehensive error recovery
- ✅ **Graceful shutdown** - SIGINT/SIGTERM handlers

## Quick Start

### 1. Install Dependencies

```bash
cd bridge-relayer
npm install
```

### 2. Build TypeScript

```bash
npm run build
```

### 3. Configure Environment

```bash
cp .env.example .env
nano .env
```

**Required:**
- `ZCASH_RPC_PASSWORD` - From `~/.zallet/zallet.toml`
- `NEAR_RELAYER_ACCOUNT` - Your testnet account
- `WZEC_CONTRACT` - Deployed wZEC contract address
- `INTENTS_ADAPTER` - Deployed intents adapter address

**Optional:**
- `ZCASH_CUSTODY_ACCOUNT_UUID` - Specific account UUID (uses first account if not set)

### 4. Run Relayer

```bash
# Production (compiled)
npm start

# Development (ts-node)
npm run dev
```

## Project Structure

### Services

**ZcashService** (`services/zcash.service.ts`)
- Zallet RPC integration
- Deposit monitoring
- Transaction sending
- Type-safe RPC methods

**NearService** (`services/near.service.ts`)
- NEAR API integration
- wZEC minting using SDK
- Balance queries

**StateService** (`services/state.service.ts`)
- Persistent state management
- Tx

id tracking
- Block height tracking

### Main Orchestrator

**BridgeRelayer** (`relayer.ts`)
- Coordinates all services
- Monitors deposits
- Processes minting
- Handles errors and retries

## Type Definitions

All types are in `src/types.ts`:

```typescript
// Zallet RPC types
ZalletAccount
ZalletBalance
ZalletUnspentOutput
ZalletOperationStatus
BlockchainInfo

// Bridge types
RelayerConfig
RelayerState
DepositEvent
PendingWithdrawal
```

## Development

### Build

```bash
npm run build
```

### Clean

```bash
npm run clean
```

### Type Check

```bash
npx tsc --noEmit
```

## Testing

### Prerequisites

1. **Zebra synced** (~90%+)
2. **Zallet RPC available** (port 28232)
3. **Custody account** with testnet ZEC
4. **NEAR contracts deployed** to testnet

### Test Deposit Flow

**Terminal 1: Start relayer**
```bash
npm run dev
```

**Terminal 2: Send test deposit**
```bash
# Get your custody address
UUID=$(curl -s --user "zcashrpc:testpass123" \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_listaccounts","params":[]}' \
  http://127.0.0.1:28232/ | jq -r '.result[0].account_uuid')

CUSTODY_ADDR=$(curl -s --user "zcashrpc:testpass123" \
  --data-binary "{\"jsonrpc\":\"1.0\",\"id\":\"1\",\"method\":\"z_getaddressforaccount\",\"params\":[\"$UUID\",[\"sapling\"]]}" \
  http://127.0.0.1:28232/ | jq -r '.result.address')

# Send test deposit with company memo
echo -n "company:company.your-account.testnet" | xxd -p | tr -d '\n'
# Use output as memo in z_sendmany
```

**Terminal 3: Verify wZEC minted**
```bash
near view wzec.your-account.testnet ft_balance_of \
  '{"account_id": "company.your-account.testnet"}' \
  --networkId testnet
```

## Configuration

### Zallet Setup

Ensure `~/.zallet/zallet.toml` has RPC enabled:

```toml
[rpc]
bind = ["127.0.0.1:28232"]

[[rpc.auth]]
user = "zcashrpc"
password = "testpass123"
```

### NEAR Credentials

```bash
near login
# Creates credentials in ~/.near-credentials/testnet/
```

## Error Handling

The relayer handles:

- ✅ Zallet RPC connection failures
- ✅ NEAR connection failures
- ✅ Transaction confirmation timeouts
- ✅ Minting failures (with retry)
- ✅ State persistence failures

Failed deposits are logged but not marked as processed, so they'll be retried on next poll.

## State Management

State is persisted in `relayer-state.json`:

```json
{
  "lastProcessedBlock": 1234567,
  "processedTxids": ["abc123...", "def456..."],
  "pendingWithdrawals": []
}
```

On restart, the relayer resumes from `lastProcessedBlock`.

## Monitoring

### Logs

The relayer outputs structured logs:

```
🌉 Zcash → NEAR Bridge Relayer
================================

✅ Connected to Zcash testnet
  Block height: 1234567

Custody Account: 550e8400-e29b-41d4-a716-446655440000
Custody Balance: 0.5 ZEC

✅ Connected as: relayer.your-account.testnet
  Balance: 10.5 NEAR

🚀 Relayer started! Monitoring for deposits...

📦 New Zcash blocks: 1234567 → 1234570

🔔 New deposit detected!
  Txid: abc123...
  Amount: 0.01 ZEC (1000000 zatoshis)
  Receiver: company.your-account.testnet
  ✅ Minted successfully!
  NEAR tx: def456...
```

## Next Steps

- [ ] Implement withdrawal processing
- [ ] Add monitoring dashboard
- [ ] Add metrics/alerting
- [ ] Add database for state (vs JSON file)
- [ ] Add multi-sig custody support

## See Also

- **Zallet Setup:** [../docs/ZCASH_SETUP.md](../docs/ZCASH_SETUP.md)
- **RPC Reference:** [../docs/ZCASH_RPC_REFERENCE.md](../docs/ZCASH_RPC_REFERENCE.md)
- **Gap Analysis:** [../docs/ZCASH_INTEGRATION_GAP_ANALYSIS.md](../docs/ZCASH_INTEGRATION_GAP_ANALYSIS.md)
- **NEAR SDK:** [../sdk/](../sdk/)
