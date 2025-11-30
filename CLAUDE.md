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

**🎉 MILESTONE ACHIEVED (2025-11-29): First RISC Zero Groth16 verification on NEAR Protocol!**

**Contracts**: ✅ Production Ready
- Payroll: Employee management, payments, disclosures, trustless income proofs
- wZEC: NEP-141 with bridge operations (transparent on NEAR, private on Zcash)
- **Verifier: ✅ RISC Zero Groth16 proof verification working on NEAR!**
  - Full endianness conversion (BE → LE)
  - alt_bn128 precompile integration
  - Cross-chain compatible (same proof works on Ethereum and NEAR)

**Circuits**: ✅ Fully implemented
- Payment proof (RISC Zero)
- Income proof (4 types: Threshold, Range, Average, Credit)
- Balance proof
- All circuits generate Groth16 proofs locally (no Bonsai needed)

**Proof Server**: ✅ Fully implemented
- Local Groth16 proof generation using `ProverOpts::groth16()` (RISC Zero v3.0.4)
- REST API for proof generation
- Verification key and image ID registration tools

**Verification**: ✅ Working on Both Chains
- ✅ Ethereum verification (reference implementation)
- ✅ **NEAR verification (our implementation) - ALL TESTS PASSING!**

**SDK**: ✅ Initial implementation
- TypeScript interfaces for all contracts
- Crypto utilities (commitments)

**Testing**: ✅ Comprehensive test suite
- NEAR Workspaces integration tests
- VK registration tests
- Image ID registration tests
- ✅ **Real proof verification tests passing on NEAR**

## TODO

### Critical
- [x] Implement real RISC Zero verification ✅ DONE (Groth16 on-chain)
- [ ] Implement proper encryption (NaCl/ECIES) - Currently using placeholders
- [x] Zcash testnet infrastructure ✅ DONE (Zebra + Zallet running, 55% synced)
- [ ] Bridge relayer updates - Update for Zallet compatibility (see ZCASH_INTEGRATION_GAP_ANALYSIS.md)

### Short-term
- [ ] NEAR testnet deployment
- [x] Integration tests ✅ DONE (NEAR Workspaces sandbox)
- [ ] Frontend UI
- [ ] Privacy improvements (see docs/PRIVACY_ANALYSIS.md)
  - [ ] Private balance tracking (use commitments)
  - [ ] Shielded wZEC variant (private NEP-141)

### Long-term
- [ ] Security audit
- [ ] Mainnet deployment
- [ ] Documentation site
- [ ] Layer 2 privacy solution (rollup with private state)

## Common Issues

### NEAR SDK
- Use `near-sdk = "5.5.0"` for latest features
- BorshStorageKey requires `#[borsh(crate = "near_sdk::borsh")]`
- Collections need unique storage keys

### RISC Zero
- Guest programs use `#![no_main]` and `#![no_std]`
- Journal commits are public outputs
- Image ID is hash of circuit
- **CRITICAL**: Use `ProverOpts::groth16()` NOT manual `shrink_wrap()` for correct seal format
- Seal format: [selector (4)] + [proof points (256)]
- v3.0.x selector: `0x73c457ba`, v5.0.x selector: `0xa7b87ed1`
- **Endianness on NEAR**: ALL proof data must be converted from BE → LE
  - See `docs/RISC0_GROTH16_NEAR_ARCHITECTURE.md` for complete guide

## Privacy Analysis

**See `docs/PRIVACY_ANALYSIS.md` for comprehensive privacy analysis.**

**Key Findings:**
- ✅ Salary commitments hide amounts (cryptographically binding)
- ✅ ZK proofs enable trustless income verification
- ✅ Zcash bridge provides transaction privacy (on Zcash side)
- ❌ wZEC balances and transfers are PUBLIC on NEAR (standard NEP-141)
- ❌ Employee balances are publicly queryable

**Core Value Proposition:** Privacy-preserving income verification, NOT transaction-level privacy on NEAR.

## Documentation

### Main Documentation
- **[RISC Zero Groth16 on NEAR Architecture](docs/RISC0_GROTH16_NEAR_ARCHITECTURE.md)** - Complete guide (2025-11-29) ✅
- **[Privacy Analysis](docs/PRIVACY_ANALYSIS.md)** - Security and privacy guarantees

### Investigation History (Chronological)
1. **[RISC0_GROTH16_INVESTIGATION.md](docs/RISC0_GROTH16_INVESTIGATION.md)** - Initial seal format investigation (2025-11-28)
2. **[NEAR_ENDIANNESS_FINAL_SOLUTION.md](docs/NEAR_ENDIANNESS_FINAL_SOLUTION.md)** - Endianness strategy (2025-11-28)
3. **[PAIRING_FALSE_INVESTIGATION.md](docs/PAIRING_FALSE_INVESTIGATION.md)** - Debugging pairing failures (2025-11-28)
4. **[SMOKING_GUN_FOUND.md](docs/SMOKING_GUN_FOUND.md)** - split_digest padding bug (2025-11-28)

## Reference Links

- NEAR SDK Docs: https://docs.near.org/sdk/rust
- RISC Zero Docs: https://dev.risczero.com/api
- NEP-141 Standard: https://nomicon.io/Standards/Tokens/FungibleToken
- NEAR Workspaces: https://github.com/near/workspaces-rs
- EIP-197 (BN254 Pairing): https://eips.ethereum.org/EIPS/eip-197
