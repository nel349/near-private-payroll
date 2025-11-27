# NEAR Private Payroll

A privacy-preserving payroll system built on NEAR Protocol with Zcash integration and RISC Zero ZK proofs.

## Overview

NEAR Private Payroll enables companies to run payroll while keeping salary amounts private. Employees can prove income properties (e.g., "I earn at least $X") to third parties without revealing actual amounts.

### Key Features

- **Privacy-Preserving Income Verification** - Prove income properties (e.g., "I earn ≥ $X") without revealing exact amounts using ZK proofs
- **Salary Commitments** - Amounts hidden via Pedersen commitments (cryptographically binding but not revealing)
- **Encrypted Payment History** - Only employees can decrypt their payment details
- **Selective Disclosure** - Grant time-limited access to specific verifiers (banks, landlords)
- **Trustless Verification** - RISC Zero Groth16 proofs verified on-chain, no trusted auditor needed
- **Zcash Bridge Integration** - Private deposits/withdrawals via Zcash shielded pool (off NEAR)

**Note:** wZEC token transfers on NEAR are transparent (standard NEP-141). For transaction privacy, bridge to Zcash.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           NEAR Protocol                                  │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │   Payroll       │  │    wZEC         │  │   ZK Verifier   │         │
│  │   Contract      │  │    Token        │  │   Contract      │         │
│  │                 │  │   (NEP-141)     │  │                 │         │
│  │  • Employees    │  │                 │  │  • Payment      │         │
│  │  • Payments     │  │  • Mint/Burn    │  │    proofs       │         │
│  │  • Disclosures  │  │  • Bridge       │  │  • Income       │         │
│  │  • Proofs       │  │    events       │  │    proofs       │         │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
│           │                    │                    │                   │
└───────────┼────────────────────┼────────────────────┼───────────────────┘
            │                    │                    │
            │                    │                    │
┌───────────▼────────────────────▼────────────────────▼───────────────────┐
│                         RISC Zero Circuits                               │
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │  Payment Proof  │  │  Income Proof   │  │  Balance Proof  │         │
│  │                 │  │                 │  │                 │         │
│  │  Proves payment │  │  • Threshold    │  │  Proves balance │         │
│  │  matches salary │  │  • Range        │  │  ownership      │         │
│  │  commitment     │  │  • Average      │  │                 │         │
│  │                 │  │  • Credit score │  │                 │         │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
└─────────────────────────────────────────────────────────────────────────┘
            │
            │
┌───────────▼─────────────────────────────────────────────────────────────┐
│                           Zcash Blockchain                               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │                    Shielded Pool (Sapling/Orchard)                  ││
│  │                                                                     ││
│  │  • Private deposits from company                                    ││
│  │  • Private withdrawals to employees                                 ││
│  │  • Bridge custody with threshold signatures                         ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
near-private-payroll/
├── contracts/              # NEAR smart contracts (Rust)
│   ├── payroll/           # Main payroll contract
│   ├── wzec-token/        # Wrapped ZEC token (NEP-141)
│   └── zk-verifier/       # ZK proof verifier
├── circuits/              # RISC Zero circuits
│   ├── payment-proof/     # Payment verification
│   ├── income-proof/      # Income proofs
│   └── balance-proof/     # Balance ownership
├── sdk/                   # TypeScript SDK
│   └── src/
│       ├── payroll.ts     # Payroll contract interface
│       ├── wzec.ts        # wZEC token interface
│       ├── verifier.ts    # ZK verifier interface
│       ├── crypto.ts      # Cryptographic utilities
│       └── types.ts       # Type definitions
├── docs/                  # Documentation
└── scripts/               # Deployment scripts
```

## Quick Start

### Prerequisites

- Rust 1.70+
- NEAR CLI
- Node.js 18+
- RISC Zero toolchain

### Build Contracts

```bash
# Build all contracts
cargo build --release

# Run tests
cargo test
```

### Deploy to NEAR Testnet

```bash
# Create accounts
near create-account payroll.testnet --masterAccount your-account.testnet
near create-account wzec.testnet --masterAccount your-account.testnet
near create-account verifier.testnet --masterAccount your-account.testnet

# Deploy contracts
near deploy payroll.testnet target/wasm32-unknown-unknown/release/payroll_contract.wasm
near deploy wzec.testnet target/wasm32-unknown-unknown/release/wzec_token.wasm
near deploy verifier.testnet target/wasm32-unknown-unknown/release/zk_verifier.wasm

# Initialize
near call payroll.testnet new '{"owner": "company.testnet", "wzec_token": "wzec.testnet", "zk_verifier": "verifier.testnet"}' --accountId company.testnet
```

### Using the SDK

```typescript
import { PrivatePayroll, WZecToken, generateSalaryCommitment } from '@near-private-payroll/sdk';
import { connect, keyStores } from 'near-api-js';

// Connect to NEAR
const near = await connect({
  networkId: 'testnet',
  keyStore: new keyStores.InMemoryKeyStore(),
  nodeUrl: 'https://rpc.testnet.near.org',
});

const account = await near.account('company.testnet');
const payroll = new PrivatePayroll(account, 'payroll.testnet');

// Add employee with committed salary
const salary = 5000n; // $5,000
const { value: commitment, blinding } = generateSalaryCommitment(salary);

await payroll.addEmployee(
  'alice.testnet',
  encryptedName,
  encryptedSalary,
  commitment,
  employeePublicKey
);

// Pay employee (with ZK proof)
await payroll.payEmployee(
  'alice.testnet',
  encryptedAmount,
  paymentCommitment,
  '2024-01',
  zkProof
);
```

## Privacy Model

**See [docs/PRIVACY_ANALYSIS.md](docs/PRIVACY_ANALYSIS.md) for comprehensive analysis.**

### What's Private

- **Salary amounts** - Hidden via Pedersen commitments (cryptographically binding)
- **Payment history amounts** - Encrypted, only employee can decrypt
- **Employee personal data** - Names and details encrypted
- **ZK proof internals** - Private inputs never exposed, only results
- **Zcash bridge transactions** - Fully shielded on Zcash blockchain

### What's Public (On NEAR)

- **Employee accounts** - NEAR account IDs visible
- **Employee balances** - Withdrawable balances queryable by anyone (`get_balance()`)
- **wZEC token balances** - Standard NEP-141, fully transparent on NEAR
- **wZEC transfers** - All token movements visible on-chain
- **Payment count** - Number of payments received (not amounts)
- **Employment status** - Active/OnLeave/Terminated
- **Proof results** - "Income >= $X" (true/false, to authorized verifiers only)

### Privacy Guarantees

This system excels at **privacy-preserving income verification**:
- ✅ Employees can prove income properties without revealing exact amounts
- ✅ Salary commitments hide amounts cryptographically
- ✅ Encrypted payment history (only employee can decrypt)
- ✅ ZK proofs are trustless (verified on-chain via RISC Zero)
- ✅ Zcash bridge provides transaction privacy on Zcash side

**However**, it does NOT provide:
- ❌ Transaction-level privacy on NEAR (wZEC transfers are public like any NEP-141 token)
- ❌ Balance privacy on NEAR (balances are publicly queryable)
- ❌ Anonymous employees (NEAR account IDs are visible)

**Privacy Model**: "Privacy through commitments and proofs, not through transaction shielding on NEAR"

## Income Proof Types

### 1. Income Above Threshold
```
"I earn at least $4,000 per month"
Use case: Loan applications, rental agreements
```

### 2. Income Range
```
"I earn between $8,000 and $12,000 per month"
Use case: Credit products, tiered services
```

### 3. Average Income
```
"My average income over 6 months is at least $10,000"
Use case: Mortgage applications
```

### 4. Credit Score
```
"My payment consistency score is at least 700"
Use case: Creditworthiness verification
```

## Zcash Bridge

The wZEC token enables private value transfer:

1. **Deposit**: Company sends ZEC to bridge custody (shielded)
2. **Mint**: Bridge mints equivalent wZEC on NEAR
3. **Use**: wZEC used in payroll contract
4. **Burn**: Employee burns wZEC for withdrawal
5. **Withdraw**: Bridge sends shielded ZEC to employee

### Security

- Threshold signatures (t-of-n) for bridge custody
- Timelock on large withdrawals
- Fraud proofs for invalid mints

## Development

### Running Tests

```bash
# Contract tests
cargo test

# SDK tests
cd sdk && npm test
```

### Building RISC Zero Circuits

```bash
cd circuits/payment-proof
cargo build --release
```

## Roadmap

- [x] Core contracts (Payroll, wZEC, Verifier)
- [x] RISC Zero circuits
- [x] TypeScript SDK
- [ ] Bridge relayer implementation
- [ ] Frontend UI
- [ ] Testnet deployment
- [ ] Security audit
- [ ] Mainnet launch

## License

MIT

## Contributing

Contributions welcome! Please read our contributing guidelines.

## Security

If you discover a security vulnerability, please send an email to security@example.com.

---

Built with ❤️ for privacy-preserving finance on NEAR Protocol
