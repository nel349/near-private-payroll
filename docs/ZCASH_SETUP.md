# Zcash Testnet Setup Guide

**Last Updated:** 2025-11-30
**Tools:** Zebra (node) + Zallet (wallet)
**Status:** Official, working setup

---

## Overview

This guide covers setting up Zcash testnet using the **official, current tools**:
- **Zebra** - Modern Zcash full node (Rust-based, ARM64 native)
- **Zallet** - Official Zcash wallet (replaces deprecated zcashd)

### What We're NOT Using (Deprecated/Archived)
- ❌ zcashd - Deprecated in 2025, difficult setup
- ❌ Zecwallet Lite - Archived September 2023
- ❌ zecwallet-light-cli - Build fails, archived 2023

---

## Part 1: Zebra Node Setup

Zebra is the blockchain node that syncs and validates the Zcash network.

### Prerequisites
- Docker installed
- ~20GB disk space
- Apple Silicon Mac (or x86_64 with minor changes)

### Installation

#### Step 1: Create Zebra Config

```bash
mkdir -p ~/.zebra-testnet
cat > ~/.zebra-testnet/zebrad.toml << 'EOF'
[network]
network = "Testnet"
listen_addr = "0.0.0.0:18233"

[state]
cache_dir = "/var/zebra"

[rpc]
listen_addr = "0.0.0.0:18232"
EOF
```

#### Step 2: Start Zebra

```bash
docker run -d \
  --name zebra-testnet \
  -p 18232:18232 \
  -p 18233:18233 \
  -v ~/.zebra-testnet:/etc/zebrad \
  -v ~/.zebra-testnet-data:/var/zebra \
  zfnd/zebra:latest \
  zebrad -c /etc/zebrad/zebrad.toml start
```

#### Step 3: Monitor Sync Progress

```bash
# Check sync status
docker logs zebra-testnet 2>&1 | grep "sync_percent" | tail -1

# Watch live progress (Ctrl+C to exit)
watch -n 5 'docker logs zebra-testnet 2>&1 | grep "sync_percent" | tail -1'

# View all logs
docker logs -f zebra-testnet
```

**Expected output:**
```
sync_percent=7.742% current_height=Height(237200) remaining_sync_blocks=2826424
```

**Sync time:** ~1-2 hours for full testnet sync

#### Step 4: Test RPC (Once Synced to ~20%)

```bash
curl --user ":" \
  --data-binary '{"jsonrpc":"1.0","id":"test","method":"getblockchaininfo","params":[]}' \
  -H 'content-type: text/plain;' \
  http://127.0.0.1:18232/
```

### Zebra Commands Reference

```bash
# Start Zebra
docker start zebra-testnet

# Stop Zebra
docker stop zebra-testnet

# Restart Zebra
docker restart zebra-testnet

# View logs
docker logs zebra-testnet

# Check container status
docker ps | grep zebra

# Remove container (keeps data)
docker stop zebra-testnet && docker rm zebra-testnet
```

---

## Part 2: Zallet Wallet Setup

Zallet is the official Zcash wallet that connects to Zebra.

### Prerequisites
- Rust installed (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- Zebra synced to at least 20%
- `age` installed (`brew install age`)

### Installation

#### Step 1: Clone and Build Zallet

```bash
cd /Users/norman/Development/NEAR
git clone https://github.com/zcash/wallet.git zallet
cd zallet
cargo build --release
```

**Build time:** ~2-3 minutes

**Binary location:** `./target/release/zallet`

#### Step 2: Create Wallet Directory

```bash
mkdir -p ~/.zallet
```

#### Step 3: Generate Config

```bash
./target/release/zallet example-config \
  --this-is-alpha-code-and-you-will-need-to-recreate-the-example-later \
  -o ~/.zallet/zallet.toml
```

#### Step 4: Configure for Testnet + Zebra

```bash
# Set network to testnet
sed -i '' 's/network = "main"/network = "test"/' ~/.zallet/zallet.toml

# Point to local Zebra node
sed -i '' 's/#validator_address = UNSET/validator_address = "127.0.0.1:18232"/' ~/.zallet/zallet.toml

# Enable RPC (optional, for remote access)
sed -i '' 's/#bind = \[\]/bind = ["127.0.0.1:28232"]/' ~/.zallet/zallet.toml
```

#### Step 5: Initialize Encryption

```bash
# Generate encryption key
age-keygen -o ~/.zallet/encryption-identity.txt

# Initialize wallet encryption
./target/release/zallet -d ~/.zallet init-wallet-encryption
```

#### Step 6: Generate Wallet Seed

```bash
./target/release/zallet -d ~/.zallet generate-mnemonic
```

**Output:** Your seed fingerprint (save this!)
```
Seed fingerprint: zip32seedfp1a67jwzaws0rvf7n5m9c9mk8q05452eh8gxe59dtf2xz7u6qas0asqulzz2
```

⚠️ **Important:** The mnemonic phrase is encrypted in your wallet. Export it with:
```bash
./target/release/zallet -d ~/.zallet export-mnemonic
```

#### Step 7: Start Zallet

**Wait until Zebra is at least 20% synced**, then:

```bash
./target/release/zallet -d ~/.zallet start
```

**Expected output:**
```
INFO zallet::components::chain: Resolved validator_address '127.0.0.1:18232' to 127.0.0.1:18232
INFO zallet::components::chain: Starting Zaino indexer
INFO Launching Chain Fetch Service..
```

Leave this running in a terminal, or run in background with `&` or `tmux`/`screen`.

---

## Part 3: Getting Testnet ZEC

### Option 1: Testnet Faucets

Try these faucets (may be down, try all):
- https://faucet.testnet.z.cash/
- https://testnet.zecfaucet.com/

**Amount:** Usually 0.01-0.1 TAZ per request

### Option 2: Zcash Community Forum

Ask for testnet ZEC:
- https://forum.zcashcommunity.com/
- Post your testnet address
- Community members often help

### Option 3: Mining (Slow)

Solo mine on testnet:
```bash
# Using Zebra or zcashd
# Configure mining in zebrad.toml
```

---

## Part 4: Verify Setup

### Check Zebra is Running

```bash
docker ps | grep zebra
# Should show: zebra-testnet running
```

### Check Zebra Sync Status

```bash
docker logs zebra-testnet 2>&1 | grep "sync_percent" | tail -1
```

### Check Zallet is Running

```bash
ps aux | grep zallet
# Should show: zallet -d ~/.zallet start
```

### Test Zallet RPC Connection

Once Zallet has RPC enabled:

```bash
curl --user "zcashrpc:testpass123" \
  --data-binary '{"jsonrpc":"1.0","id":"1","method":"z_listaccounts","params":[]}' \
  http://127.0.0.1:28232/
```

---

## Quick Start Commands

### Daily Usage

```bash
# Start Zebra (if stopped)
docker start zebra-testnet

# Check Zebra sync
docker logs zebra-testnet 2>&1 | grep "sync_percent" | tail -1

# Start Zallet (in background)
cd /Users/norman/Development/NEAR/zallet
./target/release/zallet -d ~/.zallet start &

# Check Zallet is running
ps aux | grep zallet
```

### Stopping Services

```bash
# Stop Zallet
pkill -f "zallet.*start"

# Stop Zebra
docker stop zebra-testnet
```

---

## Troubleshooting

### Zebra Won't Start

**Error:** `no matching manifest for linux/arm64`
**Solution:** You're on Apple Silicon - use `zfnd/zebra:latest` (not `electriccoinco/zcashd`)

**Error:** Ports already in use
**Solution:**
```bash
docker stop zebra-testnet
docker rm zebra-testnet
# Then restart
```

### Zallet Won't Connect

**Error:** `Could not establish connection with node`
**Cause:** Zebra not synced enough yet
**Solution:** Wait until Zebra reaches ~20% sync

**Error:** `missing field 'indexer'`
**Cause:** Corrupted config
**Solution:** Regenerate config (see Step 3)

### Zallet RPC Not Working

**Error:** Connection refused on port 28232
**Cause:** RPC not enabled in config
**Solution:** Add RPC config (see Part 2, Step 4)

---

## File Locations

| Item | Location |
|------|----------|
| Zebra config | `~/.zebra-testnet/zebrad.toml` |
| Zebra data | `~/.zebra-testnet-data/` |
| Zallet binary | `/Users/norman/Development/NEAR/zallet/target/release/zallet` |
| Zallet config | `~/.zallet/zallet.toml` |
| Zallet database | `~/.zallet/wallet.db` |
| Encryption key | `~/.zallet/encryption-identity.txt` |

---

## Official Documentation

- **Zebra:** https://zebra.zfnd.org/
- **Zallet:** https://zcash.github.io/wallet/
- **Zallet RPC:** https://zcash.github.io/wallet/zcashd/json_rpc.html
- **Zcash Protocol:** https://zcash.readthedocs.io/

---

## Architecture

```
┌─────────────────┐
│  Zcash Testnet  │
│   (Blockchain)  │
└────────┬────────┘
         │
         │ P2P (port 18233)
         │
    ┌────▼─────┐
    │  Zebra   │ ← Full node, validates blocks
    │  Node    │
    └────┬─────┘
         │
         │ RPC (port 18232)
         │
    ┌────▼─────┐
    │  Zallet  │ ← Wallet, manages keys/addresses
    │  Wallet  │
    └────┬─────┘
         │
         │ RPC (port 28232)
         │
    ┌────▼────────┐
    │ Your Bridge │ ← Monitors deposits, mints wZEC
    │  Relayer    │
    └─────────────┘
```

---

## Next Steps

After completing this setup:
1. See `ZCASH_RPC_REFERENCE.md` for wallet commands
2. Configure bridge relayer to monitor deposits
3. Test ZEC → NEAR bridge flow

---

**Setup complete!** You now have:
- ✅ Zebra testnet node syncing
- ✅ Zallet wallet configured
- ✅ Ready for testnet transactions
