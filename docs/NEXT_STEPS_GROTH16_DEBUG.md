# Groth16 Verification - Remaining Test Options

**Status:** All primary hypotheses tested and rejected. Pairing check still returns FALSE.
**Date:** 2025-11-28

---

## What We've Confirmed Works ✅

- ✅ G2 serialization format (c0=imaginary, c1=real)
- ✅ G1 points valid (on curve)
- ✅ VK constants match RISC Zero v3.0.3 exactly (byte-for-byte)
- ✅ Public inputs computed correctly (all 5 values verified)
- ✅ Pairing input construction (768 bytes, 4 pairs in correct format)
- ✅ Version alignment (risc0 v3.0.3 configuration is correct)
- ✅ Proof point parsing (removed incorrect byte reversal, added G2 swap)

## What We've Ruled Out ❌

- ❌ Version incompatibility (v4.0.3 circuit-recursion is official)
- ❌ Pairing pair order (swap pairs 3/4 - no effect)
- ❌ G1 negation implementation (both methods work identically)
- ❌ VK constant errors
- ❌ Public input computation errors
- ❌ G2 serialization errors

---

## Remaining Options to Test

### Option 1: CRITICAL - Verify Proof on Ethereum First 🔥

**Why This is Critical:**
This is the MOST IMPORTANT next step because it definitively tells us if the problem is:
- NEAR-specific (proof works on Ethereum) → Focus on NEAR implementation
- Proof invalid (proof fails on Ethereum too) → Proof generation or VK mismatch issue

**Steps:**
1. Deploy RISC Zero's official Solidity Groth16 verifier to Ethereum testnet (Sepolia)
2. Submit the SAME proof we've been testing
3. Observe result:
   - ✅ **If PASSES on Ethereum** → Problem is NEAR-specific, investigate NEAR's alt_bn128
   - ❌ **If FAILS on Ethereum** → Proof/VK mismatch, regenerate proof or check VK

**Implementation:**
```bash
# 1. Get RISC Zero's Solidity verifier
# risc0-ethereum repo has RiscZeroGroth16Verifier.sol

# 2. Deploy to Sepolia with our VK

# 3. Call verify() with our proof bytes
```

**Effort:** ~2-4 hours
**Value:** EXTREMELY HIGH - definitively identifies if issue is NEAR or proof/VK
**Recommended:** ⭐⭐⭐⭐⭐ DO THIS FIRST

---

### Option 2: Test with RISC Zero's Official Test Vectors

**Rationale:** Use a known-good proof/VK pair from RISC Zero's test suite

**Steps:**
1. Find RISC Zero's Groth16 test suite in risc0-groth16 crate
2. Extract a known-good proof + VK pair
3. Test on NEAR with our verifier

**Benefits:**
- If known-good proof passes → our implementation is correct, test proof is bad
- If known-good proof fails → our implementation has bugs

**Challenges:**
- RISC Zero's test vectors might not match our public input format
- May need to adapt proof format

**Effort:** ~3-5 hours
**Value:** HIGH - validates implementation vs test data
**Recommended:** ⭐⭐⭐⭐

---

### Option 3: Instrument Pairing Input - Byte-by-Byte Comparison

**Rationale:** Compare our pairing input byte-for-byte with what Ethereum would produce

**Steps:**
1. Deploy RISC Zero Solidity verifier locally (Hardhat)
2. Add extensive logging to capture exact pairing input bytes
3. Compare with our NEAR contract's pairing input bytes
4. Identify any byte-level differences

**What to check:**
- Point encodings (G1 vs G2)
- Field element ordering
- Byte endianness
- Any padding or formatting

**Effort:** ~4-6 hours
**Value:** MEDIUM-HIGH - could reveal subtle format differences
**Recommended:** ⭐⭐⭐

---

### Option 4: Deep-Dive NEAR's alt_bn128 Source Code

**Rationale:** Examine NEAR's pairing precompile implementation for quirks

**Files to analyze:**
```
nearcore/runtime/near-vm-logic/src/logic.rs
nearcore/runtime/near-vm-logic/src/alt_bn128.rs
```

**What to look for:**
- Unexpected format requirements
- Endianness handling
- Point validation strictness
- Any deviation from Ethereum's EIP-197

**Steps:**
1. Clone nearcore repo
2. Find alt_bn128_pairing_check implementation
3. Read code, looking for NEAR-specific behaviors
4. Compare with Ethereum's bn128 precompile

**Effort:** ~6-8 hours
**Value:** MEDIUM - might find undocumented requirements
**Recommended:** ⭐⭐⭐

---

### Option 5: Generate Fresh Proof with Current Setup

**Rationale:** Test proof might be stale or from different version

**Steps:**
1. Ensure proof-server uses RISC Zero v3.0.3 (already done)
2. Generate brand new income_threshold proof
3. Test immediately with NEAR verifier
4. If still fails, at least we know proof is fresh

**Why it might help:**
- Current test proof might be from RISC Zero v3.0.4
- VK might have changed between versions

**Effort:** ~1-2 hours
**Value:** LOW-MEDIUM - easy to do, might reveal version issue
**Recommended:** ⭐⭐

---

### Option 6: Minimal Groth16 Test (Non-RISC Zero)

**Rationale:** Test if NEAR's alt_bn128 works AT ALL for Groth16

**Steps:**
1. Use snarkjs or circom to generate a minimal Groth16 proof
2. Create simple circuit: `out = a * b`
3. Generate proof locally
4. Verify on NEAR

**Benefits:**
- If minimal proof works → RISC Zero-specific issue
- If minimal proof fails → NEAR's pairing has fundamental issues

**Effort:** ~8-10 hours
**Value:** HIGH - validates NEAR's pairing works for Groth16
**Recommended:** ⭐⭐⭐⭐

---

### Option 7: Consult RISC Zero Team Directly

**Rationale:** They might have NEAR integration experience or insights

**What to ask:**
1. Has anyone verified RISC Zero Groth16 proofs on NEAR before?
2. Are there known issues with NEAR's alt_bn128 precompile?
3. Can you provide known-good test vectors?
4. What's the correct seal format for NEAR (vs Ethereum)?

**Where to ask:**
- RISC Zero Discord: https://discord.gg/risczero
- RISC Zero GitHub discussions
- Direct support channels

**Effort:** ~1-2 hours (initial contact)
**Value:** POTENTIALLY VERY HIGH - they may have solved this
**Recommended:** ⭐⭐⭐⭐

---

## My Recommended Priority Order

1. **Option 1: Verify on Ethereum** ⭐⭐⭐⭐⭐ (DO THIS FIRST)
   - 2-4 hours
   - Definitively identifies if problem is NEAR or proof/VK
   - NO POINT debugging NEAR further if proof is invalid

2. **Option 7: Consult RISC Zero Team** ⭐⭐⭐⭐
   - 1-2 hours
   - They might have instant answer
   - Could save days of debugging

3. **Option 6: Minimal Groth16 Test** ⭐⭐⭐⭐
   - 8-10 hours
   - Validates NEAR's pairing works for Groth16 generally
   - Critical if Option 1 shows proof is valid

4. **Option 2: RISC Zero Test Vectors** ⭐⭐⭐⭐
   - 3-5 hours
   - Good for validating implementation

5. **Option 3: Byte-by-Byte Comparison** ⭐⭐⭐
   - 4-6 hours
   - Might reveal subtle differences

6. **Option 4: NEAR Source Deep-Dive** ⭐⭐⭐
   - 6-8 hours
   - Good background research

7. **Option 5: Generate Fresh Proof** ⭐⭐
   - 1-2 hours
   - Easy, low probability of fixing issue

---

## Alternative: Switch Verification Method (from earlier discussion)

If testing reveals the issue cannot be fixed quickly:

**Plan A: STARK Direct Verification**
- Skip Groth16, verify STARK receipt directly on NEAR
- Pros: Works in pure Rust, no mysterious precompiles
- Cons: Higher gas costs (test if fits 300 TGas limit)
- Timeline: ~1-2 days implementation + testing

**Plan B: Off-Chain Attestation**
- Verify proofs off-chain, sign attestations
- NEAR contract verifies signatures
- Pros: Works immediately, minimal gas
- Cons: Requires trusted proof server
- Timeline: ~1 day implementation

---

## Summary

**We've exhausted all "obvious" hypotheses.** The next steps require:
1. **External validation** (Ethereum, RISC Zero team)
2. **Reference implementations** (minimal Groth16, test vectors)
3. **Deep investigation** (byte-level comparison, source code)

**OR**

**Pivot to alternative verification method** that we KNOW will work.

---

## Decision Point

**Do you want to:**

**A)** Continue debugging Groth16 (start with Option 1 - Ethereum verification)

**B)** Switch to STARK direct verification (test gas costs)

**C)** Switch to off-chain attestation (get system working ASAP)

**D)** Combination (try Option 1 + 7 for 1-2 days, then pivot if blocked)

What's your priority: **solve the mystery** or **ship working product**?
