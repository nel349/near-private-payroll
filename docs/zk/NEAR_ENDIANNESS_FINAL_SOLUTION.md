# NEAR Endianness: Final Solution

**Date**: 2025-11-28
**Status**: ✅ ROOT CAUSE IDENTIFIED - Ready to implement

---

## Executive Summary

**NEAR uses LITTLE-ENDIAN** (`from_le_bytes()`) for alt_bn128 field elements, while **RISC Zero generates BIG-ENDIAN** proofs (Ethereum-compatible). We must **reverse all 32-byte fields** when passing data from RISC Zero to NEAR.

---

## The Root Cause

### NEAR's Implementation

From `nearcore/runtime/near-vm-runner/src/logic/alt_bn128.rs`:

```rust
fn decode_u256(raw: &[u8; SCALAR_SIZE]) -> bn::arith::U256 {
    let (lo, hi) = stdx::split_array(raw);
    let lo = u128::from_le_bytes(*lo);      // ← LITTLE-ENDIAN
    let hi = u128::from_le_bytes(*hi);      // ← LITTLE-ENDIAN
    bn::arith::U256([lo, hi])
}

fn decode_fq(raw: &[u8; SCALAR_SIZE]) -> Result<bn::Fq, InvalidInput> {
    let val = decode_u256(raw);  // Uses LE interpretation
    bn::Fq::from_u256(val).map_err(|_| InvalidInput::new("invalid fq", raw))
}
```

**Proof**: NEAR explicitly uses `from_le_bytes()` to interpret field elements.

### RISC Zero's Format

RISC Zero generates Ethereum-compatible Groth16 proofs using **BIG-ENDIAN** format (EIP-197 standard).

---

## Why Previous LE Attempt Failed

### What We Did Wrong

Old code (commit HEAD~1):

```rust
// ❌ WRONG: No reversal
a_x.copy_from_slice(&data[0..32]);  // Copied BE bytes as-is
a_y.copy_from_slice(&data[32..64]);
```

**Data flow:**
1. RISC Zero generates proof point: `0x2a1b7398...` (BIG-ENDIAN number)
2. Bytes in memory: `[0x2a, 0x1b, 0x73, 0x98, ...]`
3. We sent to NEAR: `[0x2a, 0x1b, 0x73, 0x98, ...]` (no reversal)
4. NEAR called `from_le_bytes([0x2a, 0x1b, ...])`
5. NEAR got: `0x...98731b2a` (WRONG number, bytes reversed!)
6. Pairing check failed ❌

### Mathematical Proof

Example with IC1_X:

```python
# Ethereum/RISC Zero value (BIG-ENDIAN number):
eth_value = 3179835575189816632597428042194253779818690147323192973511715175294048485951

# As bytes (BIG-ENDIAN representation):
eth_be_bytes = bytes.fromhex("0707b920bc978c02f292fae2036e057be54294114ccc3c8769d883f688a1423f")

# ❌ OLD APPROACH (no reversal):
# Sent: [0x07, 0x07, 0xb9, ...]
# NEAR calls: from_le_bytes([0x07, 0x07, 0xb9, ...])
wrong_value = int.from_bytes(eth_be_bytes, 'little')
# Result: 28,613,436... > 21,888,242... (field prime) → INVALID FQ ERROR

# ✅ NEW APPROACH (reverse bytes):
reversed_bytes = eth_be_bytes[::-1]  # [0x3f, 0x42, 0xa1, ...]
# Sent: [0x3f, 0x42, 0xa1, ...]
# NEAR calls: from_le_bytes([0x3f, 0x42, 0xa1, ...])
correct_value = int.from_bytes(reversed_bytes, 'little')
# Result: 3,179,835... == eth_value ✅ CORRECT!
```

---

## The Solution

### 1. VK Constants: Store in LITTLE-ENDIAN

**Why**: NEAR will call `from_le_bytes()` on them.

**How**: Reverse all 38 VK constants from Ethereum Groth16Verifier.sol:

```rust
// Ethereum (BIG-ENDIAN):
// const IC1_X = hex!("0707b920bc978c02f292fae2036e057be54294114ccc3c8769d883f688a1423f");

// NEAR (LITTLE-ENDIAN):
const IC1_X: [u8; 32] = hex_literal::hex!("3f42a188f683d869873ccc4c119442e57b056e03e2fa92f2028c97bc20b90707");
```

### 2. Proof Points: Convert BE → LE

RISC Zero generates BIG-ENDIAN proof points. We must reverse them:

```rust
fn parse_groth16_proof(&self, data: &[u8]) -> Groth16Proof {
    // Parse A (G1 point)
    let mut a_x = [0u8; 32];
    let mut a_y = [0u8; 32];
    a_x.copy_from_slice(&data[0..32]);
    a_y.copy_from_slice(&data[32..64]);

    // ✅ REVERSE for NEAR (BE → LE)
    a_x.reverse();
    a_y.reverse();

    // Same for B and C...
}
```

### 3. Public Inputs: Convert BE → LE

Public inputs from `split_digest` are in BIG-ENDIAN. Reverse them:

```rust
let (mut control_a0, mut control_a1) = self.split_digest(&CONTROL_ROOT);
let (mut claim_c0, mut claim_c1) = self.split_digest(claim_digest);
let mut bn254_id_bytes = BN254_CONTROL_ID.clone();

// ✅ REVERSE for NEAR (BE → LE)
control_a0.reverse();
control_a1.reverse();
claim_c0.reverse();
claim_c1.reverse();
bn254_id_bytes.reverse();
```

---

## Complete Data Flow

### VK Constants
```
Ethereum Groth16Verifier.sol: 0x0707b920... (BE constant)
                              ↓ REVERSE once (at compile time)
Rust const IC1_X:             0x3f42a188... (LE bytes)
                              ↓ Pass as-is to NEAR
NEAR alt_bn128:               from_le_bytes([0x3f, 0x42, ...])
                              ↓
Field element value:          3,179,835... ✅ CORRECT
```

### Proof Points (Runtime)
```
RISC Zero seal:               [0x2a, 0x1b, 0x73, 0x98, ...] (BE bytes)
                              ↓ a_x.reverse()
After reversal:               [0x..., 0x98, 0x73, 0x1b, 0x2a] (LE bytes)
                              ↓ Pass to NEAR
NEAR alt_bn128:               from_le_bytes([0x..., 0x98, 0x73, 0x1b, 0x2a])
                              ↓
Field element value:          0x2a1b7398... ✅ CORRECT
```

### Public Inputs (Runtime)
```
split_digest output:          [0x41, 0xaf, 0x18, ...] (BE bytes)
                              ↓ control_a0.reverse()
After reversal:               [..., 0x18, 0xaf, 0x41] (LE bytes)
                              ↓ Pass to NEAR
NEAR alt_bn128:               from_le_bytes([..., 0x18, 0xaf, 0x41])
                              ↓
Scalar value:                 0x41af18... ✅ CORRECT
```

---

## Implementation Checklist

- [ ] Revert VK constants to LITTLE-ENDIAN (lines 887-925)
- [ ] Add `a_x.reverse()` and `a_y.reverse()` in `parse_groth16_proof` (after line 732)
- [ ] Add `b_x_c0/c1/y_c0/c1.reverse()` in `parse_groth16_proof` (after line 750)
- [ ] Add `c_x.reverse()` and `c_y.reverse()` in `parse_groth16_proof` (after line 757)
- [ ] Add reversal for all 5 public inputs in `verify_risc_zero_groth16_proof` (after line 824)
- [ ] Update all comments to reflect LE format and BE→LE conversions
- [ ] Rebuild contract
- [ ] Run integration test

---

## Expected Outcome

✅ No "invalid fq" errors (LE constants are valid when NEAR interprets them)
✅ Linear combination computes correctly (reversed proof points match VK)
✅ Pairing check returns TRUE (all field elements are correct)
✅ Test passes

---

## References

- **NEAR alt_bn128 implementation**: `nearcore/runtime/near-vm-runner/src/logic/alt_bn128.rs`
- **NEAR test file**: `nearcore/runtime/near-vm-runner/src/logic/tests/alt_bn128.rs`
- **EIP-197**: https://eips.ethereum.org/EIPS/eip-197 (Ethereum BIG-ENDIAN standard)
- **RISC Zero Groth16**: Uses Ethereum-compatible BIG-ENDIAN format
- **Borsh Specification**: https://borsh.io/ (General LE for integers, NOT for alt_bn128)

---

## Conclusion

The fix requires **three changes**:

1. **VK constants**: Revert to LITTLE-ENDIAN (reversed from Ethereum)
2. **Proof points**: Add `.reverse()` calls in `parse_groth16_proof`
3. **Public inputs**: Add `.reverse()` calls in `verify_risc_zero_groth16_proof`

All three are necessary because NEAR's `from_le_bytes()` interprets bytes in reverse order compared to Ethereum's BIG-ENDIAN standard.

**Status**: Ready to implement. Previous LE attempt failed because we only did #1, not #2 and #3.
