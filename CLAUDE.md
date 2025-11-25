# NEAR Private Payroll - Development Notes

**Project:** NEAR Private Payroll
**Description:** Privacy-preserving payroll system on NEAR Protocol with Zcash integration

## Development Workflow

1. **Contract modifications** → `cargo build --release`
2. **Run tests** → `cargo test`
3. **SDK changes** → `cd sdk && npm run build`
4. **Circuit changes** → Build with RISC Zero toolchain

## Project Structure

```
near-private-payroll/
├── contracts/              # NEAR smart contracts (Rust)
│   ├── payroll/           # Main payroll logic
│   ├── wzec-token/        # Wrapped ZEC (NEP-141)
│   └── zk-verifier/       # RISC Zero proof verifier
├── circuits/              # RISC Zero guest programs
│   ├── payment-proof/     # Proves payment == salary
│   ├── income-proof/      # Income property proofs
│   └── balance-proof/     # Balance ownership proofs
├── sdk/                   # TypeScript SDK
├── docs/                  # Documentation
└── scripts/               # Deployment scripts
```

## Core Contracts

### 1. Payroll Contract (`contracts/payroll`)
- Employee management (add, update status)
- Payment processing with ZK proofs
- Balance tracking (commitments)
- Disclosure management
- Income proof submission

### 2. wZEC Token (`contracts/wzec-token`)
- NEP-141 fungible token
- Bridge mint/burn operations
- Zcash shielded address validation

### 3. ZK Verifier (`contracts/zk-verifier`)
- RISC Zero receipt verification
- Image ID registration
- Payment proof verification
- Income proof verification

## RISC Zero Circuits

### Payment Proof
- **Private**: salary, blinding, payment_amount
- **Public**: salary_commitment, payment_commitment, amounts_match
- Proves payment equals committed salary

### Income Proof
- **Types**: Threshold, Range, Average, Credit Score
- **Private**: payment_history (decrypted amounts)
- **Public**: threshold/range, result (true/false)

### Balance Proof
- **Private**: balance, blinding
- **Public**: balance_commitment, sufficient_funds

## Key Patterns

### Pedersen Commitments
```rust
// Commitment = H(domain || value || blinding)
fn compute_commitment(value: u64, blinding: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"near-private-payroll:commitment:v1");
    hasher.update(value.to_le_bytes());
    hasher.update(blinding);
    hasher.finalize().into()
}
```

### RISC Zero Verification
1. Guest program computes with private inputs
2. Commits public outputs to journal
3. Generates STARK proof (receipt)
4. Verifier checks image ID and journal

## Current Status

**Contracts**: ✅ Initial implementation
- Payroll: Employee management, payments, disclosures
- wZEC: NEP-141 with bridge operations
- Verifier: Proof type handling (dev mode verification)

**Circuits**: ✅ Initial implementation
- Payment proof
- Income proof (4 types)
- Balance proof

**SDK**: ✅ Initial implementation
- TypeScript interfaces for all contracts
- Crypto utilities (commitments)

## TODO

### Critical
- [ ] Implement real RISC Zero verification (requires risc0-zkvm)
- [ ] Implement proper encryption (NaCl/ECIES)
- [ ] Bridge relayer service

### Short-term
- [ ] NEAR testnet deployment
- [ ] Integration tests
- [ ] Frontend UI

### Long-term
- [ ] Security audit
- [ ] Mainnet deployment
- [ ] Documentation site

## Common Issues

### NEAR SDK
- Use `near-sdk = "5.5.0"` for latest features
- BorshStorageKey requires `#[borsh(crate = "near_sdk::borsh")]`
- Collections need unique storage keys

### RISC Zero
- Guest programs use `#![no_main]` and `#![no_std]`
- Journal commits are public outputs
- Image ID is hash of circuit

## Reference

- NEAR SDK Docs: https://docs.near.org/sdk/rust
- RISC Zero Docs: https://dev.risczero.com/api
- NEP-141 Standard: https://nomicon.io/Standards/Tokens/FungibleToken
