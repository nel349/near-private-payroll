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

## Implementation Status

| Phase | Task | Status | Notes |
|-------|------|--------|-------|
| 1.1 | Remove auditor deps from payroll | ✅ DONE | Contracts updated |
| 1.2 | Implement RISC Zero verification | ✅ DONE | Cross-contract calls wired |
| 2.1 | New user flow implementation | ✅ DONE | Integrated in payroll contract |
| 3.1 | Payroll interface redesign | ✅ DONE | New trustless API |
| 3.2 | ZK verifier interface redesign | ✅ DONE | Verification modes, journal parsing |
| 4.1 | Update RISC Zero circuits | ✅ DONE | history_commitment added to journals |
| 4.2 | Implement Groth16 verification | ✅ DONE | Using NEAR alt_bn128 precompiles |
| 5.1 | SDK updates | ⏳ PENDING | After circuits |
| 6.1 | Testnet deployment | ⏳ PENDING | Final phase |
| 7.1 | EZKL/zkML infrastructure | 📋 PLANNED | ML-based proof support |
| 7.2 | EZKL proof verification in contracts | 📋 PLANNED | Dual proof system |
| 7.3 | ML model development | 📋 PLANNED | Credit scoring, fraud detection |
| 8.1 | Proof server (Phase 1) | 🔨 IN PROGRESS | Hackathon MVP |
| 8.2 | Local TEE proving (Phase 1.5) | 📋 PLANNED | Privacy-preserving local option |
| 8.3 | Decentralized prover network (Phase 2-3) | 📋 PLANNED | Testnet → Mainnet |

---

## Phase 1.2: RISC Zero Verification Implementation

### Understanding RISC Zero on NEAR

RISC Zero produces STARK proofs that are:
- **Transparent**: No trusted setup required
- **Post-quantum secure**: Based on hash functions
- **Large**: Raw STARK proofs are ~200KB+

#### Challenge: On-Chain Verification

Full STARK verification on-chain is expensive. Solutions:

| Approach | Proof Size | Gas Cost | Trust | Recommendation |
|----------|-----------|----------|-------|----------------|
| Full STARK on-chain | ~200KB | Very High | Trustless | Not practical for NEAR |
| Groth16 wrapper (Bonsai) | ~256 bytes | Low | Trustless | ✅ Recommended |
| Off-chain + commitment | ~64 bytes | Very Low | Semi-trusted | Fallback option |

**Recommended: RISC Zero Groth16 via Bonsai**

RISC Zero's Bonsai service can wrap STARK proofs in Groth16:
- STARK proof → Bonsai → Groth16 proof (~256 bytes)
- Groth16 verifier is ~200K gas on Ethereum, similar on NEAR
- Maintains trustless properties

### Implementation Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     RISC ZERO VERIFICATION FLOW                          │
└─────────────────────────────────────────────────────────────────────────┘

  Employee                Bonsai Service              NEAR Contracts
     │                         │                           │
     │ 1. Run guest program    │                           │
     │    locally with         │                           │
     │    private inputs       │                           │
     │                         │                           │
     │ 2. Generate STARK       │                           │
     │    proof (receipt)      │                           │
     │──────────────────────────>                          │
     │                         │                           │
     │                         │ 3. Convert STARK          │
     │                         │    to Groth16             │
     │                         │                           │
     │ 4. Receive Groth16      │                           │
     │    proof + journal      │                           │
     │<──────────────────────────                          │
     │                         │                           │
     │ 5. Submit to payroll    │                           │
     │    contract             │                           │
     │───────────────────────────────────────────────────────>
     │                         │                           │
     │                         │  6. Payroll calls         │
     │                         │     zk_verifier           │
     │                         │     .verify_groth16()     │
     │                         │                           │
     │                         │  7. Verify proof          │
     │                         │     Extract journal       │
     │                         │     Check image ID        │
     │                         │                           │
     │ 8. Success/Failure      │                           │
     │<───────────────────────────────────────────────────────
```

### ZK Verifier Contract Design

```rust
// contracts/zk-verifier/src/lib.rs

/// Verification modes supported
pub enum VerificationMode {
    /// Full STARK verification (expensive, for testing)
    FullStark,
    /// Groth16 wrapped proof (recommended for production)
    Groth16,
    /// Development mode (skip verification)
    DevMode,
}

/// Groth16 proof structure (from Bonsai)
pub struct Groth16Proof {
    /// Proof points (a, b, c)
    pub proof: Vec<u8>,  // ~256 bytes
    /// Public inputs (from journal)
    pub public_inputs: Vec<u8>,
    /// Image ID of the circuit
    pub image_id: [u8; 32],
}

/// Verify income threshold proof
pub fn verify_income_threshold(
    &mut self,
    proof: Groth16Proof,
    expected_threshold: u64,
    expected_history_commitment: [u8; 32],
) -> IncomeThresholdOutput {
    // 1. Verify image ID matches registered income threshold circuit
    let registered_id = self.image_ids.get(&ProofType::IncomeThreshold)
        .expect("Income threshold circuit not registered");
    assert_eq!(proof.image_id, registered_id, "Invalid circuit");

    // 2. Verify Groth16 proof
    let is_valid = self.verify_groth16_proof(&proof);
    assert!(is_valid, "Proof verification failed");

    // 3. Extract and validate journal outputs
    let output = self.decode_income_threshold_journal(&proof.public_inputs);

    // 4. Verify public inputs match expected values
    assert_eq!(output.threshold, expected_threshold, "Threshold mismatch");
    assert_eq!(output.history_commitment, expected_history_commitment, "Commitment mismatch");

    output
}
```

### Groth16 Verification on NEAR

The Groth16 verifier requires elliptic curve operations. NEAR Protocol has **native alt_bn128 precompiles** available since 2021:

```rust
// Available in near_sdk::env
pub fn alt_bn128_g1_multiexp(value: impl AsRef<[u8]>) -> Vec<u8>
pub fn alt_bn128_g1_sum(value: impl AsRef<[u8]>) -> Vec<u8>
pub fn alt_bn128_pairing_check(value: impl AsRef<[u8]>) -> bool
```

**Implementation approach:**
1. ✅ Use `alt_bn128_pairing_check` for Groth16 verification
2. ✅ Parse proof points (A, B, C) from receipt
3. ✅ Store verification key (α, β, γ, δ) per circuit
4. ✅ Compute pairing equation: `e(A,B) * e(-vk_α, vk_β) * e(-public_inputs, vk_γ) * e(-C, vk_δ) == 1`

**Gas Cost:** Similar to Ethereum (~200K gas equivalent on NEAR)

### Journal (Public Outputs) Format

Each circuit defines its journal structure:

```rust
// Income Threshold Circuit Journal
pub struct IncomeThresholdJournal {
    pub threshold: u64,           // The threshold being proven
    pub meets_threshold: bool,    // Result: income >= threshold
    pub payment_count: u32,       // Number of payments in proof
    pub history_commitment: [u8; 32], // Binds to on-chain data
}

// Income Range Circuit Journal
pub struct IncomeRangeJournal {
    pub range_min: u64,
    pub range_max: u64,
    pub in_range: bool,           // Result: min <= income <= max
    pub payment_count: u32,
    pub history_commitment: [u8; 32],
}

// Credit Score Circuit Journal
pub struct CreditScoreJournal {
    pub threshold: u32,
    pub meets_threshold: bool,
    pub payment_count: u32,
    pub history_commitment: [u8; 32],
}
```

### Cross-Contract Call Flow

```rust
// In payroll contract
fn verify_risc_zero_proof(
    &self,
    receipt: &[u8],
    proof_type: &IncomeProofType,
    threshold: Option<u64>,
    range_min: Option<u64>,
    range_max: Option<u64>,
    history_commitment: &[u8; 32],
) -> (bool, bool, u32) {
    // Parse the receipt/proof
    let proof: Groth16Proof = self.parse_proof(receipt);

    // Call zk-verifier contract
    match proof_type {
        IncomeProofType::AboveThreshold | IncomeProofType::AverageAboveThreshold => {
            let result = ext_zk_verifier::ext(self.zk_verifier.clone())
                .verify_income_threshold(
                    proof,
                    threshold.unwrap(),
                    *history_commitment,
                )
                .call();

            (true, result.meets_threshold, result.payment_count)
        }
        IncomeProofType::InRange => {
            let result = ext_zk_verifier::ext(self.zk_verifier.clone())
                .verify_income_range(
                    proof,
                    range_min.unwrap(),
                    range_max.unwrap(),
                    *history_commitment,
                )
                .call();

            (true, result.in_range, result.payment_count)
        }
        // ... other proof types
    }
}
```

---

## Phase 3.2: ZK Verifier Contract Updates

### New Contract Interface

```rust
// ==================== EXTERNAL INTERFACE ====================

/// Verify income threshold proof (Groth16)
#[payable]
pub fn verify_income_threshold(
    &mut self,
    proof_data: Vec<u8>,
    expected_threshold: u64,
    expected_commitment: [u8; 32],
) -> IncomeThresholdOutput;

/// Verify income range proof (Groth16)
#[payable]
pub fn verify_income_range(
    &mut self,
    proof_data: Vec<u8>,
    expected_min: u64,
    expected_max: u64,
    expected_commitment: [u8; 32],
) -> IncomeRangeOutput;

/// Verify credit score proof (Groth16)
#[payable]
pub fn verify_credit_score(
    &mut self,
    proof_data: Vec<u8>,
    expected_threshold: u32,
    expected_commitment: [u8; 32],
) -> CreditScoreOutput;

/// Verify payment proof (Groth16)
#[payable]
pub fn verify_payment(
    &mut self,
    proof_data: Vec<u8>,
    salary_commitment: [u8; 32],
    payment_commitment: [u8; 32],
) -> bool;

// ==================== ADMIN INTERFACE ====================

/// Register circuit image ID (owner only)
pub fn register_image_id(
    &mut self,
    proof_type: ProofType,
    image_id: [u8; 32],
);

/// Set verification mode (owner only)
pub fn set_verification_mode(&mut self, mode: VerificationMode);

/// Get verification mode
pub fn get_verification_mode(&self) -> VerificationMode;
```

### Data Structures

```rust
/// Verification mode
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq, Debug)]
pub enum VerificationMode {
    /// Skip verification (development only)
    DevMode,
    /// Full verification with Groth16
    Groth16,
}

/// Income threshold verification output
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, NearSchema)]
pub struct IncomeThresholdOutput {
    pub threshold: u64,
    pub meets_threshold: bool,
    pub payment_count: u32,
    pub history_commitment: [u8; 32],
    pub verified: bool,
}

/// Income range verification output
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, NearSchema)]
pub struct IncomeRangeOutput {
    pub range_min: u64,
    pub range_max: u64,
    pub in_range: bool,
    pub payment_count: u32,
    pub history_commitment: [u8; 32],
    pub verified: bool,
}
```

---

## Security Model

### Trust Assumptions

```
TRUSTLESS (Cryptographic Guarantee):
✓ Proof correctness (STARK/Groth16 mathematics)
✓ Circuit integrity (image ID binding)
✓ History binding (commitment verification)
✓ Replay protection (receipt hash tracking)

OPERATIONAL TRUST:
• Bonsai service availability (can use local prover as fallback)
• NEAR validators (standard blockchain trust)
• Circuit correctness (audited code)
```

### Attack Vectors & Mitigations

| Attack | Mitigation |
|--------|------------|
| Fake proof submission | Groth16 verification rejects invalid proofs |
| Wrong circuit | Image ID must match registered circuit |
| Fake payment history | History commitment verified against on-chain data |
| Replay same proof | Receipt hash tracked in used_receipts |
| Expired proof usage | Expiration timestamp checked |
| Threshold manipulation | Public inputs extracted from verified journal |

---

## Development vs Production Mode

### Development Mode (Current)

```rust
fn verify_risc_zero_proof(...) -> (bool, bool, u32) {
    if self.verification_mode == VerificationMode::DevMode {
        env::log_str("DEV MODE: Skipping proof verification");
        // Trust the submitted values
        return (true, true, 6);
    }
    // ... actual verification
}
```

### Production Mode

```rust
fn verify_risc_zero_proof(...) -> (bool, bool, u32) {
    // 1. Parse Groth16 proof
    let proof = Groth16Proof::try_from_slice(receipt)
        .expect("Invalid proof format");

    // 2. Verify image ID
    let expected_id = self.get_image_id(proof_type);
    assert_eq!(proof.image_id, expected_id, "Invalid circuit");

    // 3. Verify Groth16 proof cryptographically
    let is_valid = self.groth16_verify(&proof);
    assert!(is_valid, "Cryptographic verification failed");

    // 4. Extract and validate journal
    let journal = self.decode_journal(&proof.public_inputs, proof_type);

    // 5. Return verified outputs
    (true, journal.result, journal.payment_count)
}
```

---

## Next Implementation Steps

### Immediate (This Session)

1. ✅ Update payroll contract with trustless interface
2. 🔄 Update zk-verifier contract:
   - Add verification mode enum
   - Add new verification methods
   - Add journal decoding
   - Add dev mode support
3. 🔄 Test cross-contract calls

### Short-term

4. Implement Groth16 proof parsing
5. Add proper error handling
6. Write integration tests

### Medium-term

7. Integrate with Bonsai for STARK→Groth16 conversion
8. Update RISC Zero circuits with proper journal format
9. Update SDK for new flow

### Long-term

10. Security audit
11. Testnet deployment
12. Performance optimization
13. Mainnet launch

---

## Future Enhancement: EZKL/zkML Support

### Background: RISC Zero vs EZKL

The current architecture uses **RISC Zero** for ZK proofs. However, for sophisticated ML-based computations (fraud detection, real credit scoring), **EZKL** provides a more suitable approach.

| Aspect | RISC Zero | EZKL (zkML) |
|--------|-----------|-------------|
| **Input** | Rust guest programs | PyTorch/ONNX models |
| **Optimized For** | General computation | Neural network inference |
| **Use Cases** | Threshold checks, range proofs | Trained ML models, pattern recognition |
| **Proof Generation** | risc0-zkvm | EZKL Python workflow |
| **Complexity** | Simple arithmetic | Complex ML operations |

### Current RISC Zero Circuits (Simple Proofs)

```
income-proof/
├── IncomeThreshold    → sum(payments) >= threshold
├── IncomeRange        → min <= income <= max
├── AverageIncome      → avg(payments) >= threshold
└── CreditScore        → simple ±10% consistency check
```

### Proposed EZKL Models (ML-Based Proofs)

For more sophisticated analysis requiring trained models:

```
zkml/
├── FraudDetectionModel     → Neural network trained on payment patterns
├── CreditScoringModel      → Real credit model (not just consistency)
├── IncomeStabilityModel    → Variance/trend analysis with ML
├── RiskAssessmentModel     → Multi-factor risk scoring
└── AnomalyDetectionModel   → Detect unusual payment patterns
```

### Architecture with EZKL Support

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DUAL PROOF SYSTEM ARCHITECTURE                        │
└─────────────────────────────────────────────────────────────────────────┘

                         ┌─────────────────────┐
                         │   Employee Client   │
                         │  (private data)     │
                         └──────────┬──────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
        ┌───────────────────┐           ┌───────────────────┐
        │    RISC Zero      │           │      EZKL         │
        │  (Simple Proofs)  │           │  (ML-Based Proofs)│
        ├───────────────────┤           ├───────────────────┤
        │ • Threshold       │           │ • Credit Scoring  │
        │ • Range           │           │ • Fraud Detection │
        │ • Average         │           │ • Risk Assessment │
        └─────────┬─────────┘           └─────────┬─────────┘
                  │                               │
                  │  STARK → Groth16              │  ONNX → ZK Circuit
                  │  (Bonsai)                     │  (EZKL workflow)
                  │                               │
                  └───────────────┬───────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │      ZK Verifier          │
                    │  (NEAR Contract)          │
                    ├───────────────────────────┤
                    │ • verify_risc_zero()      │
                    │ • verify_ezkl()           │
                    │ • Unified output format   │
                    └───────────────────────────┘
```

### EZKL Integration Plan

#### Phase 1: Infrastructure Setup
- Add zkml/ directory with Python environment
- Port model definitions from zkSalaria
- Set up EZKL proof generation workflow
- Generate verification keys for each model

#### Phase 2: Contract Updates
- Add EZKL proof verification to zk-verifier contract
- Register EZKL circuit verification keys
- Add proof type routing (RISC Zero vs EZKL)
- Unified journal/output format

#### Phase 3: Model Development
- Train real credit scoring model on payment patterns
- Develop fraud detection neural network
- Create income stability analysis model
- Calibrate models for ZK circuit constraints

#### Phase 4: SDK Integration
- Add EZKL proof generation to TypeScript SDK
- Python SDK for ML model training
- Client-side proof generation workflow
- Model versioning and updates

### EZKL Proof Types (Proposed)

```typescript
enum EzklProofType {
  // Trained ML models
  CreditScore = 'CreditScore',        // Real credit scoring model
  FraudRisk = 'FraudRisk',            // Fraud detection network
  IncomeStability = 'IncomeStability', // Trend/variance analysis

  // Complex computations
  TaxBracket = 'TaxBracket',          // Annualized income bracket
  FirstTimeLoan = 'FirstTimeLoan',    // Loan eligibility with variance
}
```

### Why Both Systems?

**RISC Zero for:**
- Simple threshold/range proofs (fast, low overhead)
- Payment verification (amount matches commitment)
- Balance proofs

**EZKL for:**
- Credit scoring with trained models
- Fraud detection requiring pattern recognition
- Complex financial analysis needing ML
- Any computation that benefits from neural networks

### Implementation Priority

| Priority | Feature | Rationale |
|----------|---------|-----------|
| P0 | RISC Zero basics | Core functionality, simpler |
| P1 | EZKL infrastructure | Enable ML-based proofs |
| P2 | Credit scoring model | High value use case |
| P3 | Fraud detection | Security enhancement |
| P4 | Advanced models | Future expansion |

---

## File Changes Summary

### Modified Files

| File | Changes |
|------|---------|
| `contracts/payroll/src/lib.rs` | Trustless income proof submission, removed auditor deps |
| `contracts/zk-verifier/src/lib.rs` | New verification interface (pending) |
| `docs/TRUSTLESS_ARCHITECTURE_PLAN.md` | This document |
| `docs/architecture/SYSTEM_ARCHITECTURE.md` | Updated architecture diagrams |

### New Files (To Be Created)

| File | Purpose |
|------|---------|
| `contracts/zk-verifier/src/groth16.rs` | Groth16 verification logic |
| `contracts/zk-verifier/src/journal.rs` | Journal decoding |
| `sdk/src/proof.ts` | Proof generation helpers |

### Planned Files (EZKL/zkML Support)

| File | Purpose |
|------|---------|
| `zkml/` | EZKL/zkML infrastructure directory |
| `zkml/models/credit_score.py` | Credit scoring neural network |
| `zkml/models/fraud_detection.py` | Fraud detection model |
| `zkml/generated/` | Compiled circuits and keys |
| `zkml/src/prover.ts` | TypeScript proof generation |
| `contracts/zk-verifier/src/ezkl.rs` | EZKL proof verification |
| `sdk/src/zkml.ts` | zkML SDK integration |

### Planned Files (Proof Server)

| File | Purpose |
|------|---------|
| `proof-server/` | Proof server infrastructure |
| `proof-server/src/main.rs` | HTTP API + RISC Zero prover |
| `proof-server/src/tee.rs` | TEE attestation support |
| `proof-server/Dockerfile` | Container with SGX support |
| `contracts/prover-registry/` | Decentralized prover registry |
| `docs/PROOF_SERVER_ARCHITECTURE.md` | Full architecture documentation |

---

## Related Documents

- [Proof Server Architecture](./PROOF_SERVER_ARCHITECTURE.md) - Detailed proof server design, TEE integration, and decentralization roadmap
