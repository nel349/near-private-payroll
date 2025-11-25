# Trustless Architecture Implementation Plan

## Overview

This document outlines the migration from auditor-based verification (zkSalaria model) to a fully trustless architecture using RISC Zero on NEAR Protocol.

## Key Architectural Change

```
OLD (zkSalaria):
Employee → Auditor (trusted) → Contract → Verifier (Bank)
                ↓
        Trust assumption here

NEW (NEAR + RISC Zero):
Employee → Contract (RISC Zero verification) → Verifier (Bank)
                ↓
        Pure cryptographic trust
```

---

## Phase 1: Core Contract Refactoring

### 1.1 Remove Auditor Dependencies from Payroll Contract

**Current State:**
- `trusted_verifiers` map exists but not heavily used
- `submit_income_proof` accepts proofs but verification is placeholder

**Changes Required:**

| Component | Action | Priority |
|-----------|--------|----------|
| `trusted_verifiers` | Remove or repurpose for FullAudit only | High |
| `submit_income_proof` | Simplify - remove attestation params | High |
| `VerifiedIncomeProof` | Update struct - remove `verified_by` | Medium |
| Disclosure system | Keep as-is for selective access | Low |

### 1.2 Implement Real RISC Zero Verification

**Location:** `contracts/zk-verifier/src/lib.rs`

**Current placeholder:**
```rust
fn verify_risc_zero_receipt(&self, receipt: &[u8], ...) -> (bool, Vec<u8>) {
    // TODO: Implement actual RISC Zero verification
}
```

**Implementation Steps:**

1. Add `risc0-zkvm` dependency with `verify` feature
2. Deserialize RISC Zero receipt
3. Verify STARK proof
4. Check image ID matches registered circuit
5. Extract journal (public outputs)
6. Return verification result

**Note:** RISC Zero verification on NEAR requires careful gas management. May need to use:
- Groth16 wrapper for smaller proofs
- Off-chain verification with on-chain commitment (hybrid approach)

---

## Phase 2: Simplified Income Proof Flow

### 2.1 New User Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: Employee Generates Proof (OFF-CHAIN)                        │
└─────────────────────────────────────────────────────────────────────┘

Employee has private payment data:
- Payment 1: $6,000
- Payment 2: $7,000
- Payment 3: $8,000
- Wants to prove: average ≥ $5,000

1. Employee fetches encrypted payment history from contract
2. Employee decrypts locally with private key
3. Employee runs RISC Zero guest program:
   - Private inputs: [6000, 7000, 8000]
   - Public inputs: threshold=5000, commitment
   - Outputs: meets_threshold=true, payment_count=3
4. RISC Zero generates receipt (STARK proof)

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 2: Employee Submits Proof (ON-CHAIN)                           │
└─────────────────────────────────────────────────────────────────────┘

Employee calls:
  payroll_contract.submit_income_proof(
    proof_type: IncomeProofType::AboveThreshold,
    threshold: 5000,
    risc_zero_receipt: <bytes>,
  )

Contract:
1. Forwards receipt to zk_verifier contract
2. zk_verifier.verify_income_threshold(receipt, threshold)
3. Returns verified output
4. Stores proof record with expiration

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 3: Third Party Verifies (ON-CHAIN READ)                        │
└─────────────────────────────────────────────────────────────────────┘

Bank calls:
  payroll_contract.get_income_proof(employee_id)

Returns:
  {
    proof_type: "AboveThreshold",
    threshold: 5000,
    result: true,
    verified_at: 1732550400,
    expires_at: 1735142400
  }

Bank NEVER sees: actual salary amounts, payment history
```

### 2.2 Disclosure System (Unchanged)

The disclosure system remains for controlling WHO can access proofs:

```rust
pub fn grant_disclosure(
    &mut self,
    verifier: AccountId,        // Who can see
    disclosure_type: DisclosureType,  // What they can see
    duration_days: u32,         // How long
)
```

**Disclosure Types:**
- `IncomeAboveThreshold` - Can verify threshold proofs
- `IncomeRange` - Can verify range proofs
- `EmploymentStatus` - Can check employment
- `FullAudit` - Complete access (rare, for auditors)

---

## Phase 3: Contract Interface Redesign

### 3.1 New Payroll Contract Interface

```rust
// ==================== INCOME PROOF OPERATIONS ====================

/// Employee submits income proof directly (no auditor needed)
/// Proof is verified via zk-verifier contract
pub fn submit_income_proof(
    &mut self,
    proof_type: IncomeProofType,
    threshold: Option<u64>,      // For threshold/average proofs
    threshold_max: Option<u64>,  // For range proofs (min, max)
    risc_zero_receipt: Vec<u8>,  // STARK proof
) -> bool;

/// Get verified income proof (for authorized verifiers)
pub fn get_income_proof(
    &self,
    employee_id: AccountId,
) -> Option<VerifiedIncomeProof>;

/// Check if employee meets income requirement
/// Called by banks/landlords with disclosure authorization
pub fn verify_income_requirement(
    &self,
    employee_id: AccountId,
    required_type: IncomeProofType,
    required_threshold: u64,
) -> bool;
```

### 3.2 New ZK Verifier Contract Interface

```rust
// ==================== VERIFICATION OPERATIONS ====================

/// Verify income threshold proof
/// Returns IncomeThresholdOutput with verified result
pub fn verify_income_threshold(
    &mut self,
    receipt: Vec<u8>,
    expected_threshold: u64,
    history_commitment: [u8; 32],
) -> IncomeThresholdOutput;

/// Verify income range proof
pub fn verify_income_range(
    &mut self,
    receipt: Vec<u8>,
    expected_min: u64,
    expected_max: u64,
    history_commitment: [u8; 32],
) -> IncomeRangeOutput;

/// Verify payment matches salary commitment
pub fn verify_payment_proof(
    &mut self,
    receipt: Vec<u8>,
    salary_commitment: [u8; 32],
    payment_commitment: [u8; 32],
) -> bool;
```

### 3.3 Removed/Deprecated Functions

```rust
// REMOVE: No longer needed in trustless model
pub fn register_trusted_verifier(...);  // Remove from income proofs
pub fn remove_trusted_verifier(...);    // Remove from income proofs
pub fn is_trusted_verifier(...);        // Remove from income proofs

// KEEP: Still useful for FullAudit disclosure
// Rename to "register_authorized_auditor" for clarity
pub fn register_authorized_auditor(
    &mut self,
    auditor: AccountId,
    license_info: String,
) -> bool;
```

---

## Phase 4: RISC Zero Circuit Updates

### 4.1 Income Proof Circuit (Guest Program)

```rust
// circuits/income-proof/src/main.rs
#![no_main]
#![no_std]

use risc0_zkvm::guest::env;

#[risc0_zkvm::guest::entry]
fn main() {
    // Read private inputs
    let payments: Vec<u64> = env::read();
    let threshold: u64 = env::read();
    let history_commitment: [u8; 32] = env::read();

    // Compute result
    let total: u64 = payments.iter().sum();
    let average = total / payments.len() as u64;
    let meets_threshold = average >= threshold;

    // Verify history commitment matches payments
    let computed_commitment = compute_commitment(&payments);
    assert_eq!(computed_commitment, history_commitment, "History commitment mismatch");

    // Commit public outputs to journal
    env::commit(&threshold);
    env::commit(&meets_threshold);
    env::commit(&(payments.len() as u32));
    env::commit(&history_commitment);
}
```

### 4.2 Circuit Image IDs

Each circuit has a unique image ID (hash of the compiled program):

```rust
// Register image IDs on contract deployment
zk_verifier.register_image_id(
    ProofType::IncomeThreshold,
    INCOME_THRESHOLD_IMAGE_ID,  // Computed at build time
);
```

---

## Phase 5: SDK Updates

### 5.1 Simplified SDK Interface

```typescript
// sdk/src/payroll.ts

export class PrivatePayroll {
  /**
   * Generate and submit income proof
   * No auditor interaction needed
   */
  async proveIncome(
    proofType: IncomeProofType,
    threshold: number,
    privatePayments: number[],  // Decrypted locally
  ): Promise<ProofResult> {
    // 1. Generate RISC Zero proof locally
    const receipt = await this.generateProof(proofType, threshold, privatePayments);

    // 2. Submit directly to contract
    return await this.contract.submit_income_proof({
      proof_type: proofType,
      threshold: threshold.toString(),
      risc_zero_receipt: Array.from(receipt),
    });
  }

  /**
   * Check if income proof exists and meets requirement
   * For banks/landlords with disclosure authorization
   */
  async verifyIncomeRequirement(
    employeeId: string,
    requiredThreshold: number,
  ): Promise<boolean> {
    return await this.contract.verify_income_requirement({
      employee_id: employeeId,
      required_type: IncomeProofType.AboveThreshold,
      required_threshold: requiredThreshold.toString(),
    });
  }
}
```

---

## Phase 6: Migration Path

### 6.1 Backwards Compatibility

During transition, support both flows:

```rust
pub fn submit_income_proof_v2(
    &mut self,
    proof_type: IncomeProofType,
    threshold: Option<u64>,
    risc_zero_receipt: Vec<u8>,
) -> bool {
    // New trustless flow
}

// Deprecated - keep for transition period
pub fn submit_income_proof(
    &mut self,
    // ... old parameters with attestation
) -> bool {
    // Log deprecation warning
    env::log_str("DEPRECATED: Use submit_income_proof_v2");
    // ... old flow
}
```

### 6.2 Migration Steps

1. **Deploy updated zk-verifier** with real RISC Zero verification
2. **Register circuit image IDs** for all proof types
3. **Deploy updated payroll contract** with v2 methods
4. **Update SDK** to use new flow by default
5. **Deprecate old methods** after transition period
6. **Remove auditor dependencies** in final cleanup

---

## Implementation Timeline

| Phase | Task | Complexity | Dependencies |
|-------|------|------------|--------------|
| 1.1 | Remove auditor deps from payroll | Medium | None |
| 1.2 | Implement RISC Zero verification | High | risc0-zkvm crate |
| 2.1 | New user flow implementation | Medium | Phase 1 |
| 3.1 | Payroll interface redesign | Medium | Phase 2 |
| 3.2 | ZK verifier interface redesign | Medium | Phase 1.2 |
| 4.1 | Update RISC Zero circuits | Medium | None |
| 5.1 | SDK updates | Low | Phase 3 |
| 6.1 | Migration & deprecation | Low | All phases |

---

## Risk Assessment

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| RISC Zero verification gas cost | High | Use Groth16 wrapper or hybrid approach |
| Circuit complexity limits | Medium | Optimize guest programs |
| Cross-contract call failures | Medium | Proper error handling |

### Security Considerations

| Concern | Status | Notes |
|---------|--------|-------|
| Replay attacks | Handled | Track used receipts |
| History commitment binding | Handled | Verify commitment matches on-chain data |
| Timestamp freshness | Handled | Expiration on proofs |
| Image ID tampering | Handled | Owner-only registration |

---

## Next Steps

1. **Immediate**: Update contract interfaces (Phase 3)
2. **Short-term**: Implement RISC Zero verification (Phase 1.2)
3. **Medium-term**: Update circuits and SDK (Phases 4-5)
4. **Long-term**: Testnet deployment and migration (Phase 6)
