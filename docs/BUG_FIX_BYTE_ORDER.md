# Bug Fix: RISC Zero Groth16 Verification on NEAR - Byte Order Issue

**Date**: November 27, 2024
**Severity**: Critical - Prevented all Groth16 proof verifications
**Status**: ✅ FIXED

## Summary

Fixed a critical byte order bug that caused all RISC Zero Groth16 proofs to fail verification on NEAR with "invalid fq" errors. The issue was due to a mismatch between RISC Zero's big-endian output format and NEAR's little-endian interpretation of byte arrays.

## Root Cause Analysis

### The Problem

NEAR's `alt_bn128_pairing_check` precompile interprets byte arrays as **little-endian integers**, while RISC Zero outputs Groth16 proofs in **big-endian format** (Ethereum-compatible).

### Concrete Example

**VK Constant `IC[1].x`:**
Original (big-endian): `0x0707b920bc978c02f292fae2036e057be54294114ccc3c8769d883f688a1423f`

**Without byte reversal (WRONG):**
- Bytes: `[07, 07, B9, 20, ..., 3F]`
- NEAR interprets as LE: `0x3F42A188F683D869...` = 28,532,873,232,907,948,991,397...
- BN254 modulus: 21,888,242,871,839,275,222,246,405,745...
- Result: **28,532,873,232,... > 21,888,242,871,... ❌ INVALID FQ!**

**With byte reversal (CORRECT):**
- Bytes: `[3F, 42, A1, 88, ..., 07, 07]`
- NEAR interprets as LE: `0x0707B920BC978C02...` = 3,179,835,575,551,595,634...
- Result: **3,179,835,575,... < 21,888,242,871,... ✅ VALID!**

## Files Modified

### 1. `/contracts/zk-verifier/src/lib.rs`

**Issue**: Hardcoded VK constants in `get_risc_zero_universal_vk()` used `hex_literal::hex!()` which produces big-endian bytes directly.

**Fix**: Reversed all 30 VK constants (alpha, beta, gamma, delta, IC points) from big-endian to little-endian.

**Changes**:
- Lines 788-828: Replaced all VK constants with reversed versions
- Added comments explaining the byte reversal requirement
- Generated via `scripts/reverse_vk_constants.js`

**Before**:
```rust
const IC1_X: [u8; 32] = hex_literal::hex!("0707b920bc978c02f292fae2036e057be54294114ccc3c8769d883f688a1423f");
```

**After**:
```rust
const IC1_X: [u8; 32] = hex_literal::hex!("3f42a188f683d869873ccc4c119442e57b056e03e2fa92f2028c97bc20b90707");
```

### 2. `/contracts/zk-verifier/src/lib.rs` (hex_serde module)

**Status**: Already correct ✅

The `deserialize_32()` function (lines 34-56) was **already** reversing bytes when deserializing from JSON:

```rust
bytes.reverse(); // Convert from big-endian (JSON) to little-endian (NEAR)
```

This was working correctly for VK registration via JSON, but the hardcoded constants were bypassing this.

### 3. `/proof-server/src/services/prover.rs`

**Status**: Already correct ✅

The `convert_seal_to_fixed_format()` function (lines 286-301) was **already** reversing bytes:

```rust
let mut reversed = vec.clone();
reversed.reverse(); // Convert from big-endian (RISC Zero) to little-endian (NEAR)
```

### 4. `/contracts/zk-verifier/src/groth16.rs` (negate_g1)

**Status**: Already correct ✅

The `negate_g1()` function (lines 239-263) was **already** using little-endian modulus:

```rust
const BN254_MODULUS_LE: [u8; 32] = [
    0x47, 0xfd, 0x7c, 0xd8, ..., // LSB first
    ...
    0x29, 0xa0, 0x31, 0xe1, 0x72, 0x4e, 0x64, 0x30,  // MSB last
];
```

## New Unit Tests

Added comprehensive tests to prevent regression:

### 1. `test_vk_field_elements_are_valid_bn254` (lib.rs:1399-1475)

**Purpose**: Verifies ALL VK field elements are valid BN254 field elements
**What it tests**:
- Loads VK from contract
- Interprets each byte array as little-endian integer
- Checks: value < BN254 modulus
- Covers: 30 field elements (alpha, beta, gamma, delta, 6× IC points)

**Why critical**: Ensures NEAR won't reject any VK component with "invalid fq"

### 2. `test_vk_byte_order_consistency` (lib.rs:1477-1525)

**Purpose**: Verifies byte reversal is correct
**What it tests**:
- Takes `IC[1].x` as test case
- Interprets bytes as little-endian integer
- Compares with expected big-endian hex value
- Verifies result < BN254 modulus

**Why critical**: Catches if reversal logic is accidentally removed

### 3. Integration test fix (integration_test.rs:88-100)

**Issue**: Test was comparing registered VK against original big-endian bytes from JSON

**Fix**: Added byte reversal before comparison:
```rust
expected_x_bytes.reverse(); // Match contract's little-endian format
```

## Helper Script

### `/scripts/reverse_vk_constants.js`

**Purpose**: Generate reversed VK constants from `risc0_vk.json`

**Usage**:
```bash
node scripts/reverse_vk_constants.js
```

**Output**: Rust constants ready to paste into `lib.rs`

## Test Results

### Unit Tests: ✅ All Pass

```
running 10 tests
test groth16::tests::test_g1_point_serialization ... ok
test tests::test_verify_risc_zero_constants ... ok
test tests::test_get_risc_zero_universal_vk ... ok
test tests::test_new ... ok
test tests::test_split_digest ... ok
test tests::test_split_digest_matches_solidity ... ok
test tests::test_receipt_format_groth16 ... ok
test tests::test_register_image_id ... ok
test tests::test_vk_byte_order_consistency ... ok
test tests::test_vk_field_elements_are_valid_bn254 ... ok

test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured
```

### Integration Tests: ✅ All Pass

```
running 3 tests
test test_groth16_receipt_format ... ok
test test_register_image_id ... ok
test test_register_and_query_verification_key ... ok

test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured
```

## Technical Deep Dive

### NEAR's alt_bn128 Precompile Behavior

NEAR's Ethereum-compatible precompiles have a subtle difference:

**Ethereum**: Interprets 32-byte arrays as **big-endian** field elements
**NEAR**: Interprets 32-byte arrays as **little-endian** field elements

This is likely due to NEAR's Rust implementation using native byte order or a different serialization format than Ethereum's Go implementation.

### BN254 Field Element Validity

For a byte array to be a valid BN254 field element:
- When interpreted as an integer (in correct endianness)
- Must be < BN254 field modulus: `21888242871839275222246405745257275088696311157297823662689037894645226208583`

If the wrong endianness is used, valid big-endian values become invalid little-endian values.

### Data Flow

```
RISC Zero (Rust)
    ↓ shrink_wrap()
Groth16 Seal (big-endian Vec<Vec<u8>>)
    ↓ convert_seal_to_fixed_format()
256-byte proof (little-endian [u8]) ✅ REVERSED
    ↓ Network
NEAR Contract
    ↓ alt_bn128_pairing_check(&bytes)
NEAR interprets as little-endian ✅ CORRECT
    ↓
Verification result
```

## Verification Checklist

- [x] All VK constants reversed (30 total)
- [x] Proof-server seal conversion reverses bytes
- [x] VK JSON deserialization reverses bytes
- [x] negate_g1 uses little-endian modulus
- [x] Unit tests verify all field elements are valid
- [x] Integration tests pass with reversed bytes
- [x] Documentation updated

## Future Considerations

### Prevention

1. **Always use `hex_serde::deserialize_32`** for hex → bytes conversion
2. **Never use `hex_literal::hex!()`** directly for VK/proof data
3. **Run field element validity tests** on any new VK constants
4. **Document endianness** in all crypto-related code

### Testing

The new unit tests will catch:
- Accidentally removing byte reversal
- Using wrong endianness for new VK constants
- Invalid field elements in hardcoded values

## References

- BN254 Curve: https://neuromancer.sk/std/bn/bn254
- NEAR alt_bn128 docs: https://docs.near.org/develop/contracts/security/protocol
- RISC Zero Groth16: https://dev.risczero.com/api/zkvm/groth16
- Ethereum Precompiles: https://www.evm.codes/precompiled

## Acknowledgments

This bug was discovered through systematic debugging of the "invalid fq" error with comprehensive logging and step-by-step analysis of the entire verification flow.
