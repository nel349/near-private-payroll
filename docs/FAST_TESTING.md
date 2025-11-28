# Fast Verification Testing

This document explains how to test RISC Zero Groth16 proof verification quickly using Rust integration tests instead of slow TypeScript tests.

## Overview

**Problem:** Full integration tests in TypeScript take ~2+ minutes per proof generation and require running the proof-server.

**Solution:** Pre-generate test proofs once, save them as JSON, then load them in fast Rust integration tests.

## Workflow

### One-Time Setup: Generate Test Proofs

Generate real Groth16 proofs and save them for reuse:

```bash
# Generate income threshold test proof (~2 minutes)
cargo test -p proof-server --test generate_test_proof generate_income_threshold_test_proof -- --nocapture --ignored

# Generate income range test proof (~2 minutes)
cargo test -p proof-server --test generate_test_proof generate_income_range_test_proof -- --nocapture --ignored

# Generate credit score test proof (~2 minutes)
cargo test -p proof-server --test generate_test_proof generate_credit_score_test_proof -- --nocapture --ignored
```

This saves test proofs to:
- `scripts/test_proofs/income_threshold.json`
- `scripts/test_proofs/income_range.json`
- `scripts/test_proofs/credit_score.json`

### Fast Iteration: Test Verification Changes

Once you have test proofs, you can iterate quickly:

```bash
# 1. Make changes to groth16.rs or lib.rs
vim contracts/zk-verifier/src/groth16.rs

# 2. Rebuild contract (takes ~10 seconds)
cargo build --release -p zk-verifier

# 3. Run fast verification test (takes ~5 seconds)
cargo test -p zk-verifier --test integration_test test_real_proof_verification -- --nocapture

# 4. Test failure modes too
cargo test -p zk-verifier --test integration_test test_verification_failure_modes -- --nocapture
```

**Total iteration time: ~15 seconds** vs ~2+ minutes with TypeScript tests!

## What the Tests Do

### `test_real_proof_verification`

1. Loads pre-generated proof from `scripts/test_proofs/income_threshold.json`
2. Deploys zk-verifier contract to local sandbox
3. Registers VK and image ID
4. Calls `verify_income_threshold` with the real proof
5. Reports SUCCESS or detailed error diagnostics

**Error Detection:** If verification fails, the test shows which bug is the culprit:
- "invalid bool" → Bug #2 (sign byte position)
- "invalid fr" → Bug #4 (BN254_CONTROL_ID modulus)
- "invalid fq" → Bug #5 (coordinate byte order)
- "invalid g2" → Bug #3/#5 (pairing format or G2 coords)

### `test_verification_failure_modes`

Tests that the contract correctly rejects invalid proofs:
1. Corrupted proof seal (should fail pairing check)
2. Wrong history commitment (should fail journal check)

## Files Structure

```
proof-server/
└── tests/
    └── generate_test_proof.rs    # Generates test proofs (run once)

contracts/zk-verifier/
└── tests/
    └── integration_test.rs       # Fast verification tests (run often)

scripts/
└── test_proofs/                  # Saved test proofs (generated once)
    ├── income_threshold.json
    ├── income_range.json
    └── credit_score.json
```

## When to Regenerate Test Proofs

You need to regenerate test proofs if:
- ✅ Circuits change (income-proof, payment-proof, balance-proof)
- ✅ VK changes (risc0_vk.json)
- ✅ Image IDs change
- ❌ Contract code changes (NO - proofs are still valid)
- ❌ Bug fixes in groth16.rs (NO - proofs are still valid)

## Comparison: Old vs New Workflow

### Old Workflow (TypeScript)
```bash
# Start proof-server (build + wait)
cargo build --release -p proof-server
ELF_DIR="$PWD/target/riscv32im-risc0-zkvm-elf/docker" ./target/release/proof-server &

# Rebuild contract
cargo build --release -p zk-verifier

# Run full integration test
npm test tests/integration.test.ts

# Total: ~3-5 minutes per iteration
```

### New Workflow (Rust)
```bash
# Rebuild contract
cargo build --release -p zk-verifier

# Run fast test
cargo test -p zk-verifier --test integration_test test_real_proof_verification

# Total: ~15 seconds per iteration
```

**Speedup: 12-20x faster!**

## Debugging Tips

1. **Test passes but TypeScript fails?**
   - Check that the same proof inputs are used
   - Verify history commitment computation matches

2. **Test fails with "test proof not found"?**
   - Run the generate_test_proof test first (see "One-Time Setup")

3. **Want to test with different inputs?**
   - Modify `generate_income_threshold_test_proof` parameters
   - Regenerate: `cargo test -p proof-server --test generate_test_proof ... -- --ignored`
   - Re-run verification test

4. **Want to see detailed logs?**
   - Add `-- --nocapture` to see all println! output
   - Contract logs are shown in test failures

## Summary

This fast testing approach:
- ✅ Uses real Groth16 proofs (not mocks)
- ✅ Tests actual verification logic
- ✅ Provides detailed error diagnostics
- ✅ Enables rapid iteration (15s vs 2+ min)
- ✅ Runs in Rust (no TypeScript/Node.js needed)
- ✅ No proof-server needed after initial setup
