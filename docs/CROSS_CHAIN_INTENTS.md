# Cross-Chain Privacy with NEAR Intents

This document describes how the NEAR Private Payroll system integrates with NEAR Intents protocol for cross-chain operations, enabling privacy-preserving payroll with Zcash and other chains.

## Overview

The integration enables two key cross-chain flows:

1. **Company Deposits**: Fund payroll from Zcash or other chains
2. **Employee Withdrawals**: Withdraw salary to Zcash shielded addresses or other chains

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    NEAR Private Payroll + Intents                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   Company    │───▶│   Payroll    │───▶│   Employee   │          │
│  │   (ZEC)      │    │   Contract   │    │   Balance    │          │
│  └──────────────┘    └──────────────┘    └──────┬───────┘          │
│         │                   │                    │                  │
│         │ deposit           │ ZK proofs         │ withdraw         │
│         ▼                   ▼                    ▼                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   Intents    │    │ ZK Verifier  │    │   Intents    │          │
│  │   Adapter    │    │  (RISC Zero) │    │   Adapter    │          │
│  └──────┬───────┘    └──────────────┘    └──────┬───────┘          │
│         │                                       │                  │
│         ▼                                       ▼                  │
│  ┌──────────────┐                       ┌──────────────┐           │
│  │    NEAR      │                       │    NEAR      │           │
│  │   Intents    │                       │   Intents    │           │
│  └──────┬───────┘                       └──────┬───────┘           │
│         │                                       │                  │
│         ▼                                       ▼                  │
│  ┌─────────────────────────────────────────────────────┐           │
│  │              Cross-Chain Bridges (PoA)              │           │
│  └─────────────────────────────────────────────────────┘           │
│         │                                       │                  │
│         ▼                                       ▼                  │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐       │
│  │   Zcash   │  │  Solana   │  │ Ethereum  │  │  Bitcoin  │       │
│  │ (shielded)│  │           │  │           │  │           │       │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘       │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

## Contracts

### 1. Intents Adapter (`contracts/intents-adapter`)

The bridge between the payroll system and NEAR Intents protocol.

**Key Features:**
- Routes deposits from external chains to payroll contract
- Initiates cross-chain withdrawals via NEAR Intents
- Validates destination addresses for all supported chains
- Tracks pending deposits and withdrawals
- Configurable fees per chain

**Supported Chains:**
| Chain | Deposits | Withdrawals | Fee |
|-------|----------|-------------|-----|
| Zcash | ✅ | ✅ | 0.5% |
| Solana | ❌ | ✅ | 0.3% |
| Ethereum | ❌ | ✅ | 1.0% |
| Bitcoin | ❌ | ✅ | 0.5% |
| NEAR | ✅ | ✅ | 0% |

### 2. Payroll Contract Updates

The payroll contract now includes:

```rust
// Set intents adapter (owner only)
pub fn set_intents_adapter(&mut self, intents_adapter: AccountId);

// Employee withdraws to external chain
pub fn withdraw_via_intents(
    &mut self,
    amount: U128,
    destination_chain: DestinationChain,
    destination_address: String,
) -> Promise;
```

## Flows

### Company Deposit Flow

```
1. Company deposits ZEC to bridge custody address on Zcash
   └─▶ Zcash shielded transaction

2. Bridge relayer detects deposit and mints wZEC on NEAR
   └─▶ PoA bridge operation

3. wZEC transferred to Intents Adapter via ft_transfer_call
   └─▶ Message: "deposit:company.near:zcash:tx_hash"

4. Intents Adapter forwards to Payroll Contract
   └─▶ Company balance updated

5. Company can now pay employees with wZEC
```

### Employee Withdrawal Flow

```
1. Employee calls withdraw_via_intents on Payroll Contract
   └─▶ Args: amount, DestinationChain::Zcash, "zs1..."

2. Payroll deducts balance and calls Intents Adapter
   └─▶ initiate_withdrawal()

3. Intents Adapter transfers wZEC to NEAR Intents
   └─▶ ft_transfer_call with cross-chain message

4. NEAR Intents routes to appropriate bridge
   └─▶ PoA bridge for Zcash

5. Bridge releases ZEC on Zcash network
   └─▶ Shielded output to employee's z-address
```

## SDK Usage

### TypeScript

```typescript
import {
  PrivatePayroll,
  IntentsAdapterSDK,
  DestinationChain,
  ZcashAddressType
} from '@near-private-payroll/sdk';

// Initialize
const payroll = new PrivatePayroll(account, 'payroll.near');
const intents = new IntentsAdapterSDK('intents-adapter.near', near);

// Validate Zcash address
const validation = IntentsAdapterSDK.validateZcashAddress(
  'zs1j29m7zdmh0s2k2c2fqjcpxlqm9uvr9q3r5xeqf...'
);
console.log(validation.valid); // true
console.log(validation.type);  // ZcashAddressType.Shielded

// Employee withdraws to Zcash shielded address
const withdrawalId = await payroll.withdrawViaIntents(
  '100000000', // 1 ZEC (8 decimals)
  DestinationChain.Zcash,
  'zs1j29m7zdmh0s2k2c2fqjcpxlqm9uvr9q3r5xeqf...'
);

// Track withdrawal status
const status = await intents.getPendingWithdrawal(withdrawalId);
console.log(status.status); // 'Processing'
```

### Company Deposit (via ft_transfer_call)

```typescript
import { buildDepositMessage } from '@near-private-payroll/sdk';

// Build deposit message
const msg = buildDepositMessage(
  'company.near',  // Company account
  'zcash',         // Source chain
  'tx_abc123...'   // Source transaction
);

// Execute deposit via wZEC contract
await wzec.ft_transfer_call({
  receiver_id: 'intents-adapter.near',
  amount: '100000000', // 1 ZEC
  msg: msg // "deposit:company.near:zcash:tx_abc123..."
});
```

## Privacy Considerations

### Zcash Shielded Addresses (Recommended)

For maximum privacy, employees should withdraw to **Zcash Sapling shielded addresses** (`zs1...`):

- Transaction amounts are hidden
- Sender/receiver addresses are hidden
- Only the recipient can view transaction details

### Transparent Addresses (Not Recommended)

Transparent addresses (`t1...`, `t3...`) work like Bitcoin:
- Transaction amounts are visible
- Sender/receiver addresses are visible
- No privacy benefits

### Address Validation

The SDK validates address formats before submission:

```typescript
// Shielded address validation
IntentsAdapterSDK.validateZcashAddress('zs1...');
// { valid: true, type: ZcashAddressType.Shielded }

// Transparent address validation
IntentsAdapterSDK.validateZcashAddress('t1abc...');
// { valid: true, type: ZcashAddressType.Transparent }

// Invalid address
IntentsAdapterSDK.validateZcashAddress('invalid');
// { valid: false, error: 'Unknown Zcash address format' }
```

## Configuration

### Chain Configuration

Administrators can configure supported chains:

```rust
let config = ChainConfig {
    chain: DestinationChain::Zcash,
    deposit_enabled: true,
    withdrawal_enabled: true,
    min_withdrawal: 10_000_000,  // 0.1 ZEC
    max_withdrawal: 0,           // Unlimited
    fee_bps: 50,                 // 0.5%
    bridge_address: "zcash-bridge.near".to_string(),
};

intents_adapter.update_chain_config(config);
```

### Bridge Relayers

Authorized relayers can confirm cross-chain operations:

```rust
// Add relayer
intents_adapter.add_relayer("relayer.near");

// Confirm deposit
intents_adapter.confirm_cross_chain_deposit(
    "zcash_tx_hash",
    amount,
    "company.near",
    DestinationChain::Zcash
);

// Confirm withdrawal
intents_adapter.confirm_withdrawal_complete(
    withdrawal_id,
    "zcash_tx_hash"
);
```

## Security

### Access Control

| Method | Caller |
|--------|--------|
| `initiate_withdrawal` | Payroll contract only |
| `confirm_cross_chain_deposit` | Authorized relayers |
| `confirm_withdrawal_complete` | Authorized relayers |
| `update_chain_config` | Owner only |
| `add_relayer` / `remove_relayer` | Owner only |

### Address Validation

All destination addresses are validated before processing:

- Zcash: `zs`, `zc` (shielded) or `t1`, `t3` (transparent)
- Solana: Base58, 32-44 characters
- Ethereum: `0x` prefix, 42 characters
- Bitcoin: `1`, `3`, or `bc1` prefix

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Token not supported` | wZEC not registered | Contact admin |
| `Chain not configured` | Invalid chain | Use supported chain |
| `Amount below minimum` | Amount too small | Increase amount |
| `Invalid destination address` | Bad address format | Fix address |
| `Intents adapter not configured` | Adapter not set | Admin sets adapter |

## Bounty Alignment

This integration targets the following hackathon bounties:

### NEAR Cross-Chain Privacy Solutions ($20,000)
- ✅ Uses NEAR Intents SDK
- ✅ Connects Zcash with NEAR
- ✅ Enables DeFi for Zcash users privately
- ✅ Cross-chain actions powered by intents

### NEAR Private Payments & Transactions ($5,000)
- ✅ Real-world payment solution (payroll)
- ✅ Privacy-preserving (ZK proofs + shielded)
- ✅ Uses NEAR Intents

### Project Tachyon General Bounty ($35,000 split)
- ✅ Privacy-preserving solution on Zcash
- ✅ Novel use case (private payroll)

## Resources

- [NEAR Intents Documentation](https://docs.near-intents.org)
- [Zcash Address Formats](https://zcash.readthedocs.io/en/latest/rtd_pages/addresses.html)
- [NEAR Private Payroll SDK](../sdk/README.md)
