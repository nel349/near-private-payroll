# Discrepancies & Migration Notes: zkSalaria → NEAR Private Payroll

This document tracks architectural differences between zkSalaria (Midnight) and NEAR Private Payroll, plus known issues to address.

## Architectural Differences

### Trust Model

| Aspect | zkSalaria (Midnight) | NEAR Private Payroll |
|--------|----------------------|----------------------|
| **Verification Model** | Trusted Auditor | Trustless (RISC Zero) |
| **Proof Generation** | Auditor creates attestation | Employee generates RISC Zero proof |
| **On-chain Verification** | Auditor pubkey validation | Groth16 pairing check (alt_bn128) |
| **Replay Protection** | attestation_hash tracking | receipt_hash tracking |
| **Proof Binding** | threshold binding via attestation | history_commitment in journal |

### Key Removed Concepts

1. **Trusted Verifiers (for income proofs)** - zkSalaria required registering trusted verifiers (auditors) who would attest to income proofs. In NEAR, verification is trustless via RISC Zero cryptographic proofs.

2. **EZKL Integration** - zkSalaria used EZKL for ZKML proofs. NEAR uses RISC Zero which generates STARK proofs wrapped in Groth16.

3. **Verifier Witness Pattern** - zkSalaria used a witness pattern where verifiers proved identity via secret → pubkey derivation. NEAR doesn't need this since proofs are self-verifying.

### Key Added Concepts

1. **Verification Keys** - Each circuit type requires a registered `Groth16VerificationKey` containing α, β, γ, δ points and IC array.

2. **Verification Modes** - `DevMode` (skip crypto for testing) and `Groth16` (production with real pairing checks).

3. **Cross-Contract Calls** - Payroll → ZK-Verifier calls are async with callbacks.

4. **Pending Proofs** - Proof submission is async; proof data stored temporarily until callback completes.

---

## Known Issues / TODOs

### Critical

- [ ] **Groth16 Verification Key Format** - Need to confirm exact byte format expected by `alt_bn128_pairing_check`. Current implementation assumes LE 32-byte coordinates.

- [ ] **RISC Zero Bonsai Integration** - Need to integrate with Bonsai service to convert STARK → Groth16 proofs. Currently assuming pre-wrapped Groth16 proofs.

- [ ] **History Commitment Computation** - The `compute_history_commitment` function in circuits needs to match the on-chain computation in payroll contract.

### Testing Gaps

- [ ] **Real Groth16 Proofs** - Need test vectors with actual valid Groth16 proofs to verify pairing check.

- [ ] **Cross-Contract Gas** - Need to verify 50 TGas for verify + 30 TGas for callback is sufficient.

- [ ] **Concurrent Proof Submissions** - Test behavior when same employee submits multiple proofs simultaneously.

### Functional Differences

| Feature | zkSalaria | NEAR | Notes |
|---------|-----------|------|-------|
| `registerTrustedVerifier` | Required for income proofs | NOT USED for income proofs | Still exists for FullAudit disclosure only |
| `submitIncomeProof` | Via auditor attestation | Direct employee submission | Trustless |
| `verifyIncomeProof` | Check attestation + thresholds | Already verified on submit | Just check stored proof result |
| Proof Types | 6 types (incl. TAX_BRACKET, FIRST_LOAN) | 4 types | Need to add TAX_BRACKET, FIRST_LOAN if required |
| Payment History | Encrypted amounts on ledger | Pedersen commitments on ledger | Similar privacy model |

---

## Test Adaptations Required

### From zkSalaria Tests

1. **`payroll-multi-party.test.ts`**
   - Remove: participant registration (NEAR uses account IDs directly)
   - Keep: payment history per employee
   - Adapt: privacy model (Pedersen commitments vs encrypted amounts)

2. **`payroll-zkml-comprehensive.test.ts`**
   - Remove: EZKL proof generation
   - Remove: auditor attestation flow
   - Add: RISC Zero receipt submission
   - Add: zk-verifier cross-contract verification

### New Tests Needed

1. **Cross-contract verification flow** - payroll → zk-verifier → callback
2. **DevMode vs Groth16 mode** - Verify mode switching works
3. **Verification key registration** - Admin can register VK per proof type
4. **Pending proof cleanup** - Proofs cleaned up after callback

---

## Migration Checklist

### Contract Level
- [x] Remove trusted verifier requirement for income proofs
- [x] Add `submit_income_proof` with RISC Zero receipt
- [x] Add cross-contract calls to zk-verifier
- [x] Implement Groth16 verification with alt_bn128
- [x] Add verification key storage and registration
- [ ] Add TAX_BRACKET proof type (if needed)
- [ ] Add FIRST_TIME_LOAN proof type (if needed)

### SDK Level
- [ ] Update TypeScript types for new structures
- [ ] Add Groth16 proof serialization helpers
- [ ] Add verification key encoding utilities
- [ ] Remove auditor-related code

### Testing Level
- [ ] Create sandbox test setup with near-workspaces
- [ ] Port employee management tests
- [ ] Port payment processing tests
- [ ] Port income proof tests (adapted for trustless)
- [ ] Add cross-contract integration tests
- [ ] Add DevMode/Groth16 mode tests

---

## Questions for Review

1. **Do we need TAX_BRACKET (Type 5) and FIRST_TIME_LOAN proofs?** - zkSalaria had these but our current implementation only has 4 types.

2. **How should history_commitment be computed?** - Currently computed as SHA256 of payment commitments. Need to ensure circuit matches.

3. **What's the expected Groth16 proof format from Bonsai?** - Need to verify our parsing matches their output format.

4. **Should DevMode be removable in production?** - Consider adding a "lock" function that permanently disables DevMode.

---

## File Reference

| zkSalaria File | NEAR Equivalent | Status |
|----------------|-----------------|--------|
| `payroll.compact` | `contracts/payroll/src/lib.rs` | Adapted |
| `payroll-setup-multi.ts` | `tests/setup.ts` (to create) | TODO |
| `payroll-multi-party.test.ts` | `tests/payroll.test.ts` (to create) | TODO |
| `payroll-zkml-comprehensive.test.ts` | `tests/income-proof.test.ts` (to create) | TODO |
| `attestation-hash.ts` | Not needed (trustless) | N/A |
| `zkml/payroll/` | `circuits/income-proof/` | Different framework |
