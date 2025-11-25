# NEAR Private Payroll

A privacy-preserving payroll system built on NEAR Protocol with Zcash integration and RISC Zero ZK proofs.

## Overview

NEAR Private Payroll enables companies to run payroll while keeping salary amounts private. Employees can prove income properties (e.g., "I earn at least $X") to third parties without revealing actual amounts.

### Key Features

- **Private Salary Payments** - Amounts hidden via Pedersen commitments
- **Zcash Integration** - Use ZEC for private value transfer via wZEC bridge
- **ZK Income Proofs** - Prove income properties without revealing amounts
- **Selective Disclosure** - Grant time-limited access to specific verifiers
- **RISC Zero Proofs** - Efficient STARK-based proof verification on NEAR

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

### What's Private

- **Salary amounts** - Hidden via Pedersen commitments
- **Payment amounts** - Encrypted, only employee can decrypt
- **Zcash transfers** - Fully shielded transactions

### What's Public

- **Employee accounts** - NEAR account IDs visible
- **Payment count** - Number of payments (not amounts)
- **Employment status** - Active/OnLeave/Terminated
- **Proof results** - "Income >= $X" (true/false)

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
