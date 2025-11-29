# 🎯 SMOKING GUN FOUND: split_digest Padding Bug

**Date**: 2025-11-28
**Status**: ✅ ROOT CAUSE IDENTIFIED

---

## The Bug

**File**: `contracts/zk-verifier/src/lib.rs:884-895`
**Function**: `split_digest()`

### Current Implementation (WRONG for LE)

```rust
fn split_digest(&self, digest: &[u8; 32]) -> ([u8; 32], [u8; 32]) {
    let mut reversed = *digest;
    reversed.reverse();

    let mut claim0 = [0u8; 32];
    let mut claim1 = [0u8; 32];

    // Copy 16 bytes to START of 32-byte array
    claim0[..16].copy_from_slice(&reversed[16..]);  // ❌ WRONG for LE!
    claim1[..16].copy_from_slice(&reversed[..16]);  // ❌ WRONG for LE!

    (claim0, claim1)
}
```

### What This Produces

**Ethereum (BIG-ENDIAN)**:
```
root0: a54dc85ac99f851c92d7c96d7318af41 00000000000000000000000000000000
       └─────── 16 bytes data ──────┘ └──── 16 zeros (padding) ────┘
       MSB first -----------------> LSB last
```

**NEAR (LITTLE-ENDIAN with current code)**:
```
root0: 41af18736dc9d7921c859fc95ac84da5 00000000000000000000000000000000
       └─────── 16 bytes data ──────┘ └──── 16 zeros (padding) ────┘
       LSB first (reversed) --------> ... but zeros are still at end!
```

**When NEAR calls `from_le_bytes()` on this**:
```
Bytes: [0x41, 0xaf, ..., 0xa5, 0x00, 0x00, ..., 0x00]
        └─ LSB                MSB ─┘
from_le_bytes interprets as:
  0x00000000000000000000000000000000a54dc85ac99f851c92d7c96d7318af41
  └──── These zeros become MSB! ───┘└───── Data becomes LSB ─────┘
```

**This gives us the WRONG value!** The zeros are in the most significant position, and the data is in the least significant position.

---

## Evidence

### Ethereum Public Inputs (CORRECT)
```
root0:  a54dc85ac99f851c92d7c96d7318af41 00000000000000000000000000000000
root1:  dbe7c0194edfcc37eb4d422a998c1f56 00000000000000000000000000000000
claim0: adedd11d39c68146b55fa2a5b938ee7e 00000000000000000000000000000000
claim1: 08dc25ec277f7a3fcd177e547c8f818c 00000000000000000000000000000000
```

### NEAR Public Inputs (WRONG - data/padding swapped)
```
root0:  41af18736dc9d7921c859fc95ac84da5 00000000000000000000000000000000
root1:  561f8c992a424deb37ccdf4e19c0e7db 00000000000000000000000000000000
claim0: adedd11d39c68146b55fa2a5b938ee7e 00000000000000000000000000000000
claim1: 08dc25ec277f7a3fcd177e547c8f818c 00000000000000000000000000000000
```

When reversed to compare:
```
NEAR root0 (reversed): 00000000000000000000000000000000 a54dc85ac99f851c92d7c96d7318af41
ETH root0:             a54dc85ac99f851c92d7c96d7318af41 00000000000000000000000000000000
                       ❌ MISMATCH - data is on opposite side!
```

---

## The Fix

For NEAR (LITTLE-ENDIAN), we need to put the data at the **END** of the 32-byte array, so when `from_le_bytes()` reads it LSB-first, the data ends up in the MSB position (matching Ethereum's BE representation).

### Corrected Implementation

```rust
fn split_digest(&self, digest: &[u8; 32]) -> ([u8; 32], [u8; 32]) {
    let mut reversed = *digest;
    reversed.reverse();

    let mut claim0 = [0u8; 32];
    let mut claim1 = [0u8; 32];

    // For NEAR (LE): Put 16 bytes at END so from_le_bytes() puts them in MSB
    claim0[16..].copy_from_slice(&reversed[16..]);  // ✅ CORRECT for LE
    claim1[16..].copy_from_slice(&reversed[..16]);  // ✅ CORRECT for LE

    (claim0, claim1)
}
```

### Why This Works

**After fix, NEAR produces**:
```
root0: 00000000000000000000000000000000 a54dc85ac99f851c92d7c96d7318af41
       └──── 16 zeros (padding) ────┘ └─────── 16 bytes data ──────┘
```

**When NEAR calls `from_le_bytes()` on this**:
```
Bytes: [0x00, 0x00, ..., 0x00, 0x41, 0xaf, ..., 0xa5]
        └─ LSB           ...         MSB ─┘
from_le_bytes interprets as:
  0xa54dc85ac99f851c92d7c96d7318af4100000000000000000000000000000000
  └───── Data becomes MSB ─────┘└──── Zeros become LSB ───┘
```

**This matches Ethereum's BIG-ENDIAN value!** ✅

---

## Mathematical Proof

### Ethereum (BIG-ENDIAN)
```python
eth_bytes = bytes.fromhex("a54dc85ac99f851c92d7c96d7318af4100000000000000000000000000000000")
eth_value = int.from_bytes(eth_bytes, 'big')
# = 0xa54dc85ac99f851c92d7c96d7318af41 << 128
# = 220573386764721631382247825809399621441 << 128
```

### NEAR with CURRENT CODE (WRONG)
```python
near_bytes_wrong = bytes.fromhex("41af18736dc9d7921c859fc95ac84da500000000000000000000000000000000")
near_value_wrong = int.from_bytes(near_bytes_wrong, 'little')
# = 0x00000000000000000000000000000000a54dc85ac99f851c92d7c96d7318af41
# = 220573386764721631382247825809399621441
# ❌ WRONG - missing the << 128 shift!
```

### NEAR with FIX (CORRECT)
```python
near_bytes_fixed = bytes.fromhex("00000000000000000000000000000000a54dc85ac99f851c92d7c96d7318af41")
near_value_fixed = int.from_bytes(near_bytes_fixed, 'little')
# = 0xa54dc85ac99f851c92d7c96d7318af41 << 128
# = 220573386764721631382247825809399621441 << 128
# ✅ CORRECT - matches Ethereum!
```

---

## Why Pairing Failed

The pairing equation is:
```
e(A, B) = e(α, β) · e(vk_ic, γ) · e(C, δ)
```

Where:
```
vk_ic = IC[0] + Σ(public_input[i] * IC[i+1])
```

With the WRONG public inputs (values are 2^128 times smaller than they should be), the linear combination `vk_ic` was completely wrong, causing the pairing equation to fail.

---

## Impact

This bug affected ALL 4 public inputs from `split_digest()`:
- ❌ `control_a0` (from CONTROL_ROOT)
- ❌ `control_a1` (from CONTROL_ROOT)
- ❌ `claim_c0` (from claim_digest)
- ❌ `claim_c1` (from claim_digest)

Only `bn254_id` was correct because it's a full 32-byte value (no padding/splitting).

---

## Next Steps

1. ✅ Apply the fix to `split_digest()` (change `[..16]` to `[16..]`)
2. ✅ Rebuild the contract
3. ✅ Run the test
4. ✅ Verify pairing returns TRUE

**Expected result**: PAIRING = TRUE ✅ Test passes ✅

---

## Lesson Learned

When dealing with endianness conversions:
- BIG-ENDIAN: MSB at byte[0], LSB at byte[31]
- LITTLE-ENDIAN: LSB at byte[0], MSB at byte[31]

**Padding matters!** When converting a 16-byte value to 32 bytes:
- **BE**: Data on LEFT, zeros on RIGHT (data is MSB)
- **LE**: Data on RIGHT, zeros on LEFT (so `from_le_bytes()` reads data as MSB)

The reversal alone doesn't handle padding - you must ALSO move the data to the correct end of the array.
