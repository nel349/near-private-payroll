# Complete G2 Serialization Investigation

## 1. ALL G2 Serialization Points - CURRENT STATE

### proof-server/src/services/prover.rs
**Current state:** ✅ NO SWAP (c0, c1 order) - CORRECT
- Line 343-346: seal.b serialization with add_reversed
  ```rust
  add_reversed(&mut result, &seal.b[0][0], 32)?; // B.x_c0 (real) FIRST
  add_reversed(&mut result, &seal.b[0][1], 32)?; // B.x_c1 (imaginary) SECOND
  add_reversed(&mut result, &seal.b[1][0], 32)?; // B.y_c0 (real) FIRST
  add_reversed(&mut result, &seal.b[1][1], 32)?; // B.y_c1 (imaginary) SECOND
  ```

### contracts/zk-verifier/src/lib.rs
**Current state:** ✅ NO SWAP (c0, c1 order) - CORRECT
- Line 1170-1173: append_pairing_pair
  ```rust
  buffer.extend_from_slice(&g2.x_c0);  // real FIRST
  buffer.extend_from_slice(&g2.x_c1);  // imaginary SECOND
  buffer.extend_from_slice(&g2.y_c0);  // real FIRST
  buffer.extend_from_slice(&g2.y_c1);  // imaginary SECOND
  ```

### contracts/zk-verifier/src/groth16.rs
**Current state:** ✅ NO SWAP (c0, c1 order) - CORRECT - 6 locations
- Line 163-166: proof.b → x_c0, x_c1, y_c0, y_c1
- Line 174-177: vk.beta_g2 → x_c0, x_c1, y_c0, y_c1
- Line 185-188: vk.delta_g2 → x_c0, x_c1, y_c0, y_c1
- Line 196-199: vk.gamma_g2 → x_c0, x_c1, y_c0, y_c1
- Line 509-512: test g2_point → x_c0, x_c1, y_c0, y_c1
- Line 522-525: test g2_point → x_c0, x_c1, y_c0, y_c1

### contracts/zk-verifier/src/lib.rs (VK constants)
**Current state:** ✅ NO SWAP (c0, c1 order) - CORRECT
- Line 902-917: VK G2 points (beta_g2, gamma_g2, delta_g2)
  ```rust
  beta_g2: G2Point {
      x_c0: BETA_G2_X_C0,  // real FIRST
      x_c1: BETA_G2_X_C1,  // imaginary SECOND
      y_c0: BETA_G2_Y_C0,  // real FIRST
      y_c1: BETA_G2_Y_C1,  // imaginary SECOND
  }
  ```

**Total: 8 locations**
- ✅ ALL using NO SWAP (c0, c1): 8 locations - CONSISTENT!

## 2. Test Results

### When using SWAP everywhere:
- proof-server: SWAPPED ✓
- lib.rs: SWAPPED ✓
- groth16.rs: NO SWAP (inconsistent!)
- Result: G2 validation PASSED, pairing returned FALSE

### When using NO SWAP everywhere:
- proof-server: NO SWAP ✓
- lib.rs: NO SWAP ✓
- groth16.rs: NO SWAP ✓
- Result: G2 validation FAILED with "invalid g2" error

## 3. Critical Findings

### Finding 1: RISC Zero's Seal Format
From proof server debug logs:
```
=== PROOF B POINT DEBUG ===
seal.b[0][0] (x_c0 real) BE: 0477522b9db9c168081183ef76d77070025799fccc118d44e6d01b54d64036c7
seal.b[0][1] (x_c1 imag) BE: 2a17a41d48e62bb18afe49d9a2317f5df2f6842674e4a57710de37f90125b80e
seal.b[1][0] (y_c0 real) BE: 114fbef2976497fd1efb5853c8c97426277ee6681a1fdad55943fc9718eb6e2f
seal.b[1][1] (y_c1 imag) BE: 261974913d46f6422a6f3e774923fd2c3b1dc00f55a6d3c3814a42583a7bbb06
```

**KEY DISCOVERY:** RISC Zero's seal.b is indexed as:
- `seal.b[0][0]` = x_c0 (real part)
- `seal.b[0][1]` = x_c1 (imaginary part)
- `seal.b[1][0]` = y_c0 (real part)
- `seal.b[1][1]` = y_c1 (imaginary part)

This means RISC Zero stores G2 points in **NO SWAP (c0, c1)** order!

### Finding 2: NEAR's alt_bn128_pairing_check Format

**CRITICAL: NEAR uses LITTLE-ENDIAN, different from Ethereum!**

From NEAR nearcore source code and documentation:

**Fq2 Component Order:** `(re: Fq, im: Fq)` - **real component first, then imaginary**

**Encoding:** **LITTLE-ENDIAN** (packed, little-endian fixed-sized byte arrays)

**G2 Point Structure:** Each G2 point consists of coordinates (x: Fq2, y: Fq2), where each Fq2 element has two Fq components in the order:
- x_c0 (real), x_c1 (imaginary), y_c0 (real), y_c1 (imaginary)

This means NEAR expects G2 points in **NO SWAP (c0, c1)** order with **LITTLE-ENDIAN** encoding!

**Comparison with Ethereum:**
- Ethereum (EIP-197): BIG-ENDIAN encoding (32 byte big-endian numbers)
- NEAR: LITTLE-ENDIAN encoding (packed little-endian byte arrays)
- Both use the same alt_bn128 curve, but DIFFERENT byte encoding!

**Sources:**
- [NEAR nearcore PR #2842](https://github.com/near/nearcore/pull/2842) - Add precompiled contracts for alt_bn128 curve
- [EIP-197](https://eips.ethereum.org/EIPS/eip-197) - Ethereum precompiles (BIG-ENDIAN)
- [NEAR Implementation Details](https://github.com/near/nearcore/blob/master/runtime/near-vm-logic/src/logic.rs)

## 4. Questions to Answer

1. ✅ What format does NEAR's alt_bn128_pairing_check actually expect? **ANSWER: NO SWAP (c0, c1) with little-endian**
2. ✅ What format does RISC Zero's seal.b actually produce? **ANSWER: NO SWAP (c0, c1)**
3. ✅ What format is the VK stored in? **ANSWER: NO SWAP (c0, c1)**
4. ❓ Why did SWAP pass G2 validation but fail pairing?
5. ❓ Why did NO SWAP fail G2 validation with "invalid g2" error?

## 5. Complete Analysis

### Key Findings:
**CRITICAL INSIGHT:** All components now use CONSISTENT format: **NO SWAP (c0, c1)**

✅ **RISC Zero produces:** NO SWAP (c0, c1) - seal.b[0][0] = x_c0, seal.b[0][1] = x_c1
✅ **NEAR expects:** NO SWAP (c0, c1) - Fq2 as (re: Fq, im: Fq) = (real, imaginary)
✅ **VK stores:** NO SWAP (c0, c1) - x_c0, x_c1, y_c0, y_c1
✅ **prover.rs uses:** NO SWAP (c0, c1) - CORRECT
✅ **lib.rs uses:** NO SWAP (c0, c1) - CORRECT
✅ **groth16.rs uses:** NO SWAP (c0, c1) - CORRECT (all 6 locations)

### Current Status:
**ALL 8 SERIALIZATION POINTS ARE NOW CONSISTENT!**

All components use the correct NO SWAP (c0, c1) format matching:
- RISC Zero's seal output format
- NEAR's alt_bn128 precompile expected format
- Standard Fq2 representation (real, imaginary)

### Remaining Mystery:
According to test results in section 2:
- **When NO SWAP everywhere:** "G2 validation FAILED with 'invalid g2' error"

This suggests there may be an additional issue beyond just component ordering. Possible causes:
1. The test data may have been generated with the old SWAP format
2. There may be a different serialization issue (endianness, point representation)
3. The VK constants may need to be regenerated
4. There may be an issue with how G2 points are validated

## 6. Proof Format Verification (Tested with Real Proof)

Analyzed actual proof generated by the system:

**Seal Format (256 bytes):**
- Point A (G1): 64 bytes = x (32) + y (32)
- Point B (G2): 128 bytes = x_c0 (32) + x_c1 (32) + y_c0 (32) + y_c1 (32)
- Point C (G1): 64 bytes = x (32) + y (32)

**Example G2 Point B from Real Proof:**
```
B.x_c0 (LE): 50ecc754bc71efec90127c9229f9ad21b3dac3230c91d447ab08591b38b10842
B.x_c1 (LE): 21d9d372a77d488228fec91002c9d98e28792777d595a021d40b3a1186e23176
B.y_c0 (LE): 6eb92b6651f5934cd24255e92c8bec68bd73c3500e5f0e599388c6541db7c773
B.y_c1 (LE): a20cd1b3467d1422c8ddbe19036e3c4857528aa0a247fe4c347bc930b98e0e60
```

**✅ VERIFIED:** Seal uses NO SWAP (c0, c1) format with LITTLE-ENDIAN encoding
**✅ VERIFIED:** Matches NEAR's expected format exactly

## 7. Systematic Empirical Investigation - NOVEMBER 2025

**PROBLEM: G2 Point Validation Failures**

We need to determine the correct format through empirical testing, not relying on potentially outdated web information.

### Known Facts (from actual testing):

From **Section 2** test results (previous empirical tests):
- **Config A (SWAP everywhere)**: G2 validation **PASSED**, pairing returned **FALSE**
- **Config B (NO SWAP everywhere)**: G2 validation **FAILED** with "invalid g2" error

From **Current test** (2025-11-27):
- **Config C (NO SWAP, NO REVERSAL)**: G2 validation **FAILED** with "invalid g2" error
  - Error: `AltBn128 invalid input: invalid g2: [7A, 77, B5, 65, ED, E5, 43, 81, ...]`

### Variables to Test:

We have TWO independent variables that affect G2 point format:

1. **Component Ordering**:
   - NO SWAP: x_c0, x_c1, y_c0, y_c1 (real, imag, real, imag)
   - SWAP: x_c1, x_c0, y_c1, y_c0 (imag, real, imag, real)

2. **Byte Endianness per Field**:
   - NO REVERSAL: Use bytes as received from proof-server (already passed through `add_reversed()`)
   - REVERSAL: Call `.reverse()` on each 32-byte field

### Test Matrix (4 combinations):

| Test | Component Order | Byte Order | G2 Validation | Pairing Result | Error Type |
|------|----------------|------------|---------------|----------------|------------|
| C    | NO SWAP (c0,c1)| NO REV     | FAILED ❌     | N/A            | "invalid g2" |
| 1    | NO SWAP (c0,c1)| REVERSAL   | FAILED ❌     | N/A            | "invalid fq" |
| 2    | SWAP (c1,c0)   | NO REV     | **PASSED ✅** | FALSE ❌       | Pairing failed |
| 3    | SWAP (c1,c0)   | REVERSAL   | FAILED ❌     | N/A            | "invalid fq" |

### EMPIRICAL FINDINGS - COMPLETED

**✅ ALL 4 CONFIGURATIONS TESTED SYSTEMATICALLY**

**CRITICAL RESULT:** Only **ONE** configuration passes G2 validation:
- **Test 2: SWAP (c1,c0) + NO REVERSAL**

**This means NEAR expects:**
1. **Component ordering:** SWAP - Store received c1 bytes in x_c0/y_c0, c0 bytes in x_c1/y_c1
2. **Byte endianness:** NO REVERSAL - Use bytes as-is from proof-server (little-endian)

**Correct Parsing Code:**
```rust
// Read from receipt (proof-server sends: x_c0_LE || x_c1_LE || y_c0_LE || y_c1_LE)
b_x_c0.copy_from_slice(&data[96..128]);   // SWAP: read c1 into c0
b_x_c1.copy_from_slice(&data[64..96]);    // SWAP: read c0 into c1
b_y_c0.copy_from_slice(&data[160..192]);  // SWAP: read c1 into c0
b_y_c1.copy_from_slice(&data[128..160]);  // SWAP: read c0 into c1
// NO REVERSAL - use bytes as-is (LE)
```

## 8. Pairing Check Failure Investigation

**STATUS:** G2 validation PASSES ✅, Pairing check FAILS ❌

With the correct proof parsing (SWAP + NO REVERSAL), we now pass G2 validation but the pairing check returns FALSE.

### Systematic Investigation Plan

The pairing equation being checked is:
```
e(A, B) = e(α, β) · e(L, γ) · e(C, δ)
```

Where:
- `A`, `B`, `C` = Proof points
- `α`, `β`, `γ`, `δ` = VK constants
- `L` = Linear combination of VK IC points with public inputs

**Variables that could cause pairing failure:**

1. **VK Constant Format**
   - Are VK G2 constants also swapped?
   - Are VK G1 constants in correct endianness?

2. **Public Input Computation**
   - Journal parsing correctness
   - Field element encoding (scalar values)
   - Linear combination computation

3. **Pairing Input Construction**
   - Order of G1/G2 pairs
   - Sign bytes or compression flags
   - Point negation (some implementations negate A or C)

### Test Variables

**VK G2 Constants (beta_g2, gamma_g2, delta_g2):**
- Current: NO SWAP in constants
- Test A: Apply SWAP to VK G2 constants
- Test B: Keep NO SWAP

**VK G1 Constants (alpha_g1, IC points):**
- Current: Little-endian as-is
- Test C: Reverse to big-endian
- Test D: Keep little-endian

**Pairing pairs order/negation:**
- Current: e(-A, B) vs e(L, gamma) · e(C, delta) · e(alpha, beta)
- Test E: Different negation (negate C instead of A)
- Test F: Different pair ordering

### Test Results Matrix

| Test | Variable | Configuration | G2 Validation | Pairing Result | Error Type |
|------|----------|---------------|---------------|----------------|------------|
| A    | VK G2 constants | SWAP storage | FAILED ❌     | N/A            | "invalid g2" |
| B    | VK G2 constants | NO SWAP storage | PASSED ✅     | FALSE ❌       | Pairing failed |
| C    | VK G1 constants | REVERSAL (BE) | FAILED ❌     | N/A            | "invalid fq" |
| D    | VK G1 constants | NO REV (LE)   | PASSED ✅     | FALSE ❌       | Pairing failed |
| E    | Pairing G2 serialization | SWAP all G2 | PASSED ✅     | FALSE ❌       | Pairing failed |

### EMPIRICAL FINDINGS - VK Format

**✅ VK G2 Constants:** NO SWAP (use as-is in c0, c1 order)
**✅ VK G1 Constants:** NO REVERSAL (use little-endian as-is)

**Test A (VK G2 SWAP):**
- Applied SWAP to beta_g2, gamma_g2, delta_g2
- Result: G2 validation FAILED with "invalid g2" error
- Conclusion: VK G2 constants should NOT be swapped

**Test C (VK G1 REVERSAL):**
- Reversed alpha_g1 and IC points to big-endian
- Also reversed proof A and C points to match
- Result: FAILED with "invalid fq" error during scalar_mul_g1
- Error: `AltBn128 invalid input: invalid fq: [7, 7, B9, 20, BC, 97, 8C, 2, ...]`
- Conclusion: G1 points should stay in little-endian format

**Test E (Pairing G2 Serialization SWAP):**
- Swapped ALL G2 points during pairing serialization (in `append_pairing_pair`)
- Proof B: parsed with SWAP, serialized with SWAP = **double-swap (back to original)**
- VK G2: stored NO SWAP, serialized with SWAP = **single-swap**
- Result: G2 validation PASSED ✅, Pairing returned FALSE ❌
- Conclusion: G2 serialization format alone doesn't fix pairing failure

### Current Configuration (Empirically Determined)

**Proof Points:**
- A (G1): Little-endian, no reversal
- B (G2): SWAP (c1,c0) + NO REVERSAL (little-endian)
- C (G1): Little-endian, no reversal

**VK Constants:**
- alpha_g1 (G1): Little-endian, no reversal
- beta_g2, gamma_g2, delta_g2 (G2): NO SWAP (c0, c1 order)
- IC points (G1): Little-endian, no reversal

**Status:**
- ✅ G2 validation: PASSES
- ❌ Pairing check: FAILS (returns FALSE)

### Analysis: Serialization Format Is Not The Issue

**Key Pattern Observed:**
ALL format variations (Tests B, D, E) pass G2 validation and all pre-pairing operations, but ALL return pairing FALSE. This consistent pattern across different serialization formats suggests:

**The problem is NOT serialization format. Likely causes:**
1. **Proof is invalid** - The proof itself may not verify correctly
2. **VK mismatch** - The verification key doesn't match the circuit that generated the proof
3. **Public input mismatch** - The journal parsing or public input computation is incorrect

### CRITICAL NEXT STEP

**Before testing more variations, we MUST verify the proof is valid using RISC Zero's own verification.**

The proof-server generates proofs and claims they verify, but we need to independently verify using RISC Zero's Rust verifier to ensure:
1. The receipt is a valid RISC Zero Groth16 proof
2. The proof verifies against the RISC Zero universal VK
3. The image ID and journal match

If RISC Zero's own verifier accepts the proof, then the issue is in how we're calling NEAR's pairing precompile. If RISC Zero's verifier also rejects it, then the proof generation itself is broken.

### Current Status
- ✅ Code has Test E configuration (pairing G2 serialization SWAP)
- ✅ VK G2 format tested: NO SWAP in storage is correct
- ✅ VK G1 format tested: NO REVERSAL (little-endian) is correct
- ✅ Pairing G2 serialization tested: SWAP doesn't fix pairing
- 🔴 **BLOCKING**: Need to verify proof with RISC Zero's verifier before continuing
- ⏳ After proof verification: Test pairing pair ordering/negation if proof is valid
