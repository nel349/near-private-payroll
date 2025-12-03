# wZEC Token Contract

NEP-141 fungible token representing bridged Zcash (ZEC) on NEAR Protocol.

## Overview

wZEC is a wrapped version of Zcash that enables ZEC to be used in NEAR smart contracts, particularly for the Private Payroll system. The token implements the NEP-141 standard with additional bridge functionality for minting and burning tokens.

## Features

- **NEP-141 Compatible**: Standard fungible token implementation
- **Bridge Support**: Mint/burn operations for cross-chain bridge
- **8 Decimals**: Matches ZEC precision
- **Shielded Address Validation**: Ensures withdrawals go to valid Zcash addresses
- **Withdrawal Tracking**: On-chain records for bridge relayer

## Deployment

### Prerequisites

1. NEAR CLI installed and configured
2. Rust and cargo-near installed
3. A funded NEAR testnet account

### Build

```bash
./build.sh
```

This will compile the contract to WASM at `../../target/near/wzec_token/wzec_token.wasm`

### Deploy

```bash
./deploy.sh YOUR_ACCOUNT.testnet
```

Or specify a separate bridge controller:

```bash
./deploy.sh YOUR_ACCOUNT.testnet BRIDGE_CONTROLLER.testnet
```

**Arguments:**
- `owner` - Account that owns the contract and can update settings
- `bridge_controller` - Account that can mint/burn tokens (defaults to owner)

The script will:
1. Create the `wzec.testnet` account (or prompt to delete existing)
2. Deploy the contract
3. Initialize with specified owner and bridge controller
4. Verify deployment and display token info

## Usage

### For Users

#### 1. Register for Storage

Before receiving wZEC, users must register:

```bash
near contract call-function as-transaction wzec.testnet storage_deposit \
  json-args '{}' \
  prepaid-gas '100.0 Tgas' \
  attached-deposit '0.00125 NEAR' \
  sign-as YOUR_ACCOUNT.testnet \
  network-config testnet \
  send
```

#### 2. Check Balance

```bash
near contract call-function as-read-only wzec.testnet ft_balance_of \
  json-args '{"account_id":"YOUR_ACCOUNT.testnet"}' \
  network-config testnet \
  now
```

#### 3. Transfer wZEC

```bash
near contract call-function as-transaction wzec.testnet ft_transfer \
  json-args '{"receiver_id":"RECEIVER.testnet","amount":"100000000"}' \
  prepaid-gas '100.0 Tgas' \
  attached-deposit '1 yoctoNEAR' \
  sign-as YOUR_ACCOUNT.testnet \
  network-config testnet \
  send
```

#### 4. Burn for Zcash Withdrawal

```bash
near contract call-function as-transaction wzec.testnet burn_for_zcash \
  json-args '{"amount":"100000000","zcash_shielded_address":"zs1..."}' \
  prepaid-gas '100.0 Tgas' \
  attached-deposit '0 NEAR' \
  sign-as YOUR_ACCOUNT.testnet \
  network-config testnet \
  send
```

### For Bridge Controller

#### Mint wZEC (after ZEC deposit detected)

```bash
near contract call-function as-transaction wzec.testnet mint \
  json-args '{"receiver_id":"USER.testnet","amount":"100000000","zcash_tx_hash":"abc123..."}' \
  prepaid-gas '100.0 Tgas' \
  attached-deposit '1 yoctoNEAR' \
  sign-as BRIDGE_CONTROLLER.testnet \
  network-config testnet \
  send
```

### For Owner

#### Update Bridge Controller

```bash
near contract call-function as-transaction wzec.testnet update_bridge_controller \
  json-args '{"new_controller":"NEW_BRIDGE.testnet"}' \
  prepaid-gas '100.0 Tgas' \
  attached-deposit '0 NEAR' \
  sign-as OWNER.testnet \
  network-config testnet \
  send
```

#### View Contract Info

```bash
# Get owner
near contract call-function as-read-only wzec.testnet get_owner \
  json-args '{}' \
  network-config testnet \
  now

# Get bridge controller
near contract call-function as-read-only wzec.testnet get_bridge_controller \
  json-args '{}' \
  network-config testnet \
  now

# Get total locked ZEC
near contract call-function as-read-only wzec.testnet get_total_locked_zec \
  json-args '{}' \
  network-config testnet \
  now

# Get token metadata
near contract call-function as-read-only wzec.testnet ft_metadata \
  json-args '{}' \
  network-config testnet \
  now
```

## Integration with Payroll

Once deployed, the payroll contracts use wZEC for salary payments:

1. **Company Funding**: Companies transfer wZEC to their payroll contract using `ft_transfer_call`
2. **Employee Payments**: Payroll contract tracks employee balances internally
3. **Withdrawals**: Employees can withdraw wZEC to their NEAR account or directly to Zcash

See the main payroll contract documentation for details.

## Bridge Architecture

The wZEC bridge operates in two directions:

### Zcash → NEAR (Deposit)
1. User sends ZEC to bridge custody address (shielded)
2. Bridge relayer detects deposit on Zcash blockchain
3. Relayer calls `mint()` on wZEC contract
4. User receives wZEC on NEAR

### NEAR → Zcash (Withdrawal)
1. User calls `burn_for_zcash()` with shielded address
2. wZEC tokens are burned
3. Event emitted with withdrawal details
4. Bridge relayer detects event
5. Relayer sends ZEC to user's shielded address on Zcash

## Security

- **Bridge Controller**: Only the designated bridge controller can mint tokens
- **Owner Privileges**: Owner can update bridge controller but cannot mint
- **Replay Protection**: Withdrawal nonces prevent duplicate processing
- **Address Validation**: Burn operations validate Zcash shielded address format
- **NEP-141 Compliance**: Standard security guarantees for fungible tokens

## Testing

Run contract tests:

```bash
cd /Users/norman/Development/NEAR/near-private-payroll
cargo test -p wzec-token
```

## Contract Address

**Testnet**: `wzec.testnet`

## Technical Details

- **Token Standard**: NEP-141 (Fungible Token)
- **Storage Standard**: NEP-145 (Storage Management)
- **Metadata Standard**: NEP-148 (Fungible Token Metadata)
- **Decimals**: 8 (matches ZEC)
- **Symbol**: wZEC
- **Name**: Wrapped Zcash
