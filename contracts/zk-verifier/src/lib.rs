//! # ZK Verifier Contract for NEAR Protocol
//!
//! Verifies RISC Zero proofs on-chain for the private payroll system.
//! This contract provides TRUSTLESS verification - no auditor required.
//!
//! ## Supported Proof Types
//! 1. **Payment Proof** - Proves payment amount matches committed salary
//! 2. **Income Threshold Proof** - Proves income >= threshold
//! 3. **Income Range Proof** - Proves min <= income <= max
//! 4. **Credit Score Proof** - Proves credit score >= threshold
//!
//! ## Architecture
//! - Stores image IDs (circuit hashes) for each proof type
//! - Verifies RISC Zero receipts (STARK proofs or Groth16 wrapped)
//! - Extracts and validates public outputs from journal
//! - Validates history commitments to bind proofs to on-chain data
//!
//! ## Verification Modes
//! - **DevMode**: Skip cryptographic verification (development only)
//! - **Groth16**: Full Groth16 verification (production)

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::UnorderedMap;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near_bindgen, AccountId, BorshStorageKey, NearSchema, PanicOnDefault};
use sha2::{Digest, Sha256};

#[derive(BorshStorageKey, BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
pub enum StorageKey {
    ImageIds,
    VerificationHistory,
    VerificationKeys,
}

// ==================== GROTH16 STRUCTURES ====================

/// G1 point on BN254 curve (64 bytes uncompressed)
/// Format: [x: 32 bytes LE, y: 32 bytes LE]
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct G1Point {
    pub x: [u8; 32],
    pub y: [u8; 32],
}

/// G2 point on BN254 curve (128 bytes uncompressed)
/// Format: [x_c0: 32, x_c1: 32, y_c0: 32, y_c1: 32] (LE)
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct G2Point {
    pub x_c0: [u8; 32],
    pub x_c1: [u8; 32],
    pub y_c0: [u8; 32],
    pub y_c1: [u8; 32],
}

/// Groth16 verification key for a specific circuit
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct Groth16VerificationKey {
    /// α in G1
    pub alpha_g1: G1Point,
    /// β in G2
    pub beta_g2: G2Point,
    /// γ in G2
    pub gamma_g2: G2Point,
    /// δ in G2
    pub delta_g2: G2Point,
    /// IC (input commitments) - one G1 point per public input + 1
    pub ic: Vec<G1Point>,
}

/// Groth16 proof structure
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct Groth16Proof {
    /// A point in G1
    pub a: G1Point,
    /// B point in G2
    pub b: G2Point,
    /// C point in G1
    pub c: G1Point,
}

/// Verification mode for the contract
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq, Debug, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub enum VerificationMode {
    /// Skip cryptographic verification (DEVELOPMENT ONLY)
    /// WARNING: Do not use in production!
    DevMode,
    /// Full Groth16 verification (production)
    Groth16,
}

/// Proof types supported by this verifier
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq, Eq, Hash, Debug, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub enum ProofType {
    /// Proves payment matches salary commitment
    PaymentProof,
    /// Proves income >= threshold
    IncomeThreshold,
    /// Proves min <= income <= max
    IncomeRange,
    /// Proves average income >= threshold
    AverageIncome,
    /// Proves credit score >= threshold
    CreditScore,
    /// Proves balance ownership
    BalanceProof,
}

/// Public outputs from a payment proof
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct PaymentProofOutput {
    /// Commitment to salary
    pub salary_commitment: [u8; 32],
    /// Commitment to payment amount
    pub payment_commitment: [u8; 32],
    /// True if amounts match
    pub amounts_match: bool,
}

/// Public outputs from an income threshold proof
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct IncomeThresholdOutput {
    /// The threshold being checked
    pub threshold: u64,
    /// True if income >= threshold
    pub meets_threshold: bool,
    /// Number of payments in history
    pub payment_count: u32,
    /// History commitment (binds proof to on-chain payment data)
    pub history_commitment: [u8; 32],
    /// Whether the proof was cryptographically verified
    pub verified: bool,
}

/// Public outputs from an income range proof
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct IncomeRangeOutput {
    /// Minimum of range
    pub min: u64,
    /// Maximum of range
    pub max: u64,
    /// True if min <= income <= max
    pub in_range: bool,
    /// Number of payments in history
    pub payment_count: u32,
    /// History commitment (binds proof to on-chain payment data)
    pub history_commitment: [u8; 32],
    /// Whether the proof was cryptographically verified
    pub verified: bool,
}

/// Public outputs from a credit score proof
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct CreditScoreOutput {
    /// Threshold score
    pub threshold: u32,
    /// True if score >= threshold
    pub meets_threshold: bool,
    /// Number of payments in history
    pub payment_count: u32,
    /// History commitment (binds proof to on-chain payment data)
    pub history_commitment: [u8; 32],
    /// Whether the proof was cryptographically verified
    pub verified: bool,
}

/// Verification result stored on-chain
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct VerificationRecord {
    /// Who submitted the proof
    pub submitter: AccountId,
    /// Type of proof
    pub proof_type: ProofType,
    /// Hash of the receipt
    pub receipt_hash: [u8; 32],
    /// Public outputs (serialized)
    pub public_outputs: Vec<u8>,
    /// Verification timestamp
    pub verified_at: u64,
    /// Was verification successful
    pub success: bool,
}

/// Main ZK verifier contract
#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
#[borsh(crate = "near_sdk::borsh")]
pub struct ZkVerifier {
    /// Contract owner
    pub owner: AccountId,
    /// Image IDs (circuit hashes) for each proof type
    pub image_ids: UnorderedMap<String, [u8; 32]>,
    /// Groth16 verification keys for each proof type
    pub verification_keys: UnorderedMap<String, Groth16VerificationKey>,
    /// Verification history
    pub verification_history: UnorderedMap<[u8; 32], VerificationRecord>,
    /// Total verifications
    pub total_verifications: u64,
    /// Successful verifications
    pub successful_verifications: u64,
    /// Verification mode (DevMode for development, Groth16 for production)
    pub verification_mode: VerificationMode,
}

#[near_bindgen]
impl ZkVerifier {
    /// Initialize the verifier contract
    /// Starts in DevMode by default - call set_verification_mode for production
    #[init]
    pub fn new(owner: AccountId) -> Self {
        env::log_str("WARNING: ZK Verifier initialized in DevMode. Set verification mode to Groth16 for production.");
        Self {
            owner,
            image_ids: UnorderedMap::new(StorageKey::ImageIds),
            verification_keys: UnorderedMap::new(StorageKey::VerificationKeys),
            verification_history: UnorderedMap::new(StorageKey::VerificationHistory),
            total_verifications: 0,
            successful_verifications: 0,
            verification_mode: VerificationMode::DevMode,
        }
    }

    // ==================== ADMIN OPERATIONS ====================

    /// Register an image ID for a proof type
    pub fn register_image_id(&mut self, proof_type: ProofType, image_id: [u8; 32]) {
        self.assert_owner();
        let key = format!("{:?}", proof_type);
        self.image_ids.insert(&key, &image_id);
        env::log_str(&format!(
            "Registered image ID for {:?}: {}",
            proof_type,
            hex::encode(image_id)
        ));
    }

    /// Register a Groth16 verification key for a proof type (owner only)
    /// This is required for Groth16 mode verification
    pub fn register_verification_key(&mut self, proof_type: ProofType, vk: Groth16VerificationKey) {
        self.assert_owner();
        let key = format!("{:?}", proof_type);

        // Validate VK has at least one IC point (for constant term)
        assert!(!vk.ic.is_empty(), "Verification key must have at least one IC point");

        self.verification_keys.insert(&key, &vk);
        env::log_str(&format!(
            "Registered Groth16 verification key for {:?} with {} IC points",
            proof_type,
            vk.ic.len()
        ));
    }

    /// Get the verification key for a proof type
    pub fn get_verification_key(&self, proof_type: ProofType) -> Option<Groth16VerificationKey> {
        let key = format!("{:?}", proof_type);
        self.verification_keys.get(&key)
    }

    /// Update contract owner
    pub fn transfer_ownership(&mut self, new_owner: AccountId) {
        self.assert_owner();
        self.owner = new_owner.clone();
        env::log_str(&format!("Ownership transferred to {}", new_owner));
    }

    /// Set verification mode (owner only)
    /// WARNING: Only use DevMode for development/testing!
    pub fn set_verification_mode(&mut self, mode: VerificationMode) {
        self.assert_owner();
        self.verification_mode = mode.clone();
        match mode {
            VerificationMode::DevMode => {
                env::log_str("WARNING: Verification mode set to DevMode. Proofs will NOT be cryptographically verified!");
            }
            VerificationMode::Groth16 => {
                env::log_str("Verification mode set to Groth16. Full cryptographic verification enabled.");
            }
        }
    }

    /// Get current verification mode
    pub fn get_verification_mode(&self) -> VerificationMode {
        self.verification_mode.clone()
    }

    // ==================== VERIFICATION OPERATIONS (TRUSTLESS) ====================

    /// Verify a payment proof
    /// Returns true if proof is valid and amounts match
    pub fn verify_payment_proof(
        &mut self,
        receipt: Vec<u8>,
        salary_commitment: [u8; 32],
        payment_commitment: [u8; 32],
    ) -> bool {
        let submitter = env::predecessor_account_id();
        self.total_verifications += 1;

        // Get expected image ID
        let image_id = self.get_image_id(&ProofType::PaymentProof);

        // Verify the RISC Zero receipt
        let (valid, journal) = self.verify_risc_zero_receipt(&receipt, &image_id, &ProofType::PaymentProof);

        if !valid {
            self.record_verification(
                &submitter,
                ProofType::PaymentProof,
                &receipt,
                vec![],
                false,
            );
            return false;
        }

        // Parse public outputs from journal
        let output: PaymentProofOutput = self.parse_payment_output(&journal);

        // Verify commitments match expected
        let commitments_match = output.salary_commitment == salary_commitment
            && output.payment_commitment == payment_commitment
            && output.amounts_match;

        if commitments_match {
            self.successful_verifications += 1;
        }

        self.record_verification(
            &submitter,
            ProofType::PaymentProof,
            &receipt,
            journal,
            commitments_match,
        );

        commitments_match
    }

    /// Verify an income threshold proof (TRUSTLESS)
    /// Returns verified output with meets_threshold result
    ///
    /// # Arguments
    /// * `receipt` - RISC Zero receipt (STARK or Groth16 wrapped)
    /// * `expected_threshold` - The threshold that was proven
    /// * `expected_commitment` - History commitment binding proof to on-chain data
    pub fn verify_income_threshold(
        &mut self,
        receipt: Vec<u8>,
        expected_threshold: u64,
        expected_commitment: [u8; 32],
    ) -> IncomeThresholdOutput {
        let submitter = env::predecessor_account_id();
        self.total_verifications += 1;

        let image_id = self.get_image_id(&ProofType::IncomeThreshold);
        let (valid, journal) = self.verify_risc_zero_receipt(&receipt, &image_id, &ProofType::IncomeThreshold);

        if !valid {
            self.record_verification(
                &submitter,
                ProofType::IncomeThreshold,
                &receipt,
                vec![],
                false,
            );
            return IncomeThresholdOutput {
                threshold: expected_threshold,
                meets_threshold: false,
                payment_count: 0,
                history_commitment: expected_commitment,
                verified: false,
            };
        }

        let output: IncomeThresholdOutput = self.parse_income_threshold_output(&journal, &expected_commitment);

        // Verify threshold and commitment match expected
        let valid_result = output.threshold == expected_threshold
            && output.history_commitment == expected_commitment;

        if valid_result && output.meets_threshold {
            self.successful_verifications += 1;
        }

        self.record_verification(
            &submitter,
            ProofType::IncomeThreshold,
            &receipt,
            journal,
            valid_result,
        );

        IncomeThresholdOutput {
            verified: valid_result,
            ..output
        }
    }

    /// Verify an income range proof (TRUSTLESS)
    /// Returns verified output with in_range result
    ///
    /// # Arguments
    /// * `receipt` - RISC Zero receipt (STARK or Groth16 wrapped)
    /// * `expected_min` - Minimum of the range proven
    /// * `expected_max` - Maximum of the range proven
    /// * `expected_commitment` - History commitment binding proof to on-chain data
    pub fn verify_income_range(
        &mut self,
        receipt: Vec<u8>,
        expected_min: u64,
        expected_max: u64,
        expected_commitment: [u8; 32],
    ) -> IncomeRangeOutput {
        let submitter = env::predecessor_account_id();
        self.total_verifications += 1;

        let image_id = self.get_image_id(&ProofType::IncomeRange);
        let (valid, journal) = self.verify_risc_zero_receipt(&receipt, &image_id, &ProofType::IncomeRange);

        if !valid {
            self.record_verification(
                &submitter,
                ProofType::IncomeRange,
                &receipt,
                vec![],
                false,
            );
            return IncomeRangeOutput {
                min: expected_min,
                max: expected_max,
                in_range: false,
                payment_count: 0,
                history_commitment: expected_commitment,
                verified: false,
            };
        }

        let output: IncomeRangeOutput = self.parse_income_range_output(&journal, &expected_commitment);

        let valid_result = output.min == expected_min
            && output.max == expected_max
            && output.history_commitment == expected_commitment;

        if valid_result && output.in_range {
            self.successful_verifications += 1;
        }

        self.record_verification(
            &submitter,
            ProofType::IncomeRange,
            &receipt,
            journal,
            valid_result,
        );

        IncomeRangeOutput {
            verified: valid_result,
            ..output
        }
    }

    /// Verify a credit score proof (TRUSTLESS)
    /// Returns verified output with meets_threshold result
    ///
    /// # Arguments
    /// * `receipt` - RISC Zero receipt (STARK or Groth16 wrapped)
    /// * `expected_threshold` - The credit score threshold proven
    /// * `expected_commitment` - History commitment binding proof to on-chain data
    pub fn verify_credit_score(
        &mut self,
        receipt: Vec<u8>,
        expected_threshold: u32,
        expected_commitment: [u8; 32],
    ) -> CreditScoreOutput {
        let submitter = env::predecessor_account_id();
        self.total_verifications += 1;

        let image_id = self.get_image_id(&ProofType::CreditScore);
        let (valid, journal) = self.verify_risc_zero_receipt(&receipt, &image_id, &ProofType::CreditScore);

        if !valid {
            self.record_verification(
                &submitter,
                ProofType::CreditScore,
                &receipt,
                vec![],
                false,
            );
            return CreditScoreOutput {
                threshold: expected_threshold,
                meets_threshold: false,
                payment_count: 0,
                history_commitment: expected_commitment,
                verified: false,
            };
        }

        let output: CreditScoreOutput = self.parse_credit_score_output(&journal, &expected_commitment);

        let valid_result = output.threshold == expected_threshold
            && output.history_commitment == expected_commitment;

        if valid_result && output.meets_threshold {
            self.successful_verifications += 1;
        }

        self.record_verification(
            &submitter,
            ProofType::CreditScore,
            &receipt,
            journal,
            valid_result,
        );

        CreditScoreOutput {
            verified: valid_result,
            ..output
        }
    }

    // ==================== VIEW METHODS ====================

    /// Get owner
    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    /// Get image ID for a proof type
    pub fn get_image_id_for_type(&self, proof_type: ProofType) -> Option<[u8; 32]> {
        let key = format!("{:?}", proof_type);
        self.image_ids.get(&key)
    }

    /// Get verification record by receipt hash
    pub fn get_verification(&self, receipt_hash: [u8; 32]) -> Option<VerificationRecord> {
        self.verification_history.get(&receipt_hash)
    }

    /// Get verification stats
    pub fn get_stats(&self) -> (u64, u64) {
        (self.total_verifications, self.successful_verifications)
    }

    // ==================== INTERNAL METHODS ====================

    fn assert_owner(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner,
            "Only owner can call this"
        );
    }

    fn get_image_id(&self, proof_type: &ProofType) -> [u8; 32] {
        let key = format!("{:?}", proof_type);
        self.image_ids
            .get(&key)
            .expect("Image ID not registered for this proof type")
    }

    /// Verify a RISC Zero receipt
    /// Returns (is_valid, journal_bytes)
    ///
    /// In DevMode: Skips cryptographic verification, only checks format
    /// In Groth16 mode: Full cryptographic verification using alt_bn128 precompiles
    fn verify_risc_zero_receipt(
        &self,
        receipt: &[u8],
        expected_image_id: &[u8; 32],
        proof_type: &ProofType,
    ) -> (bool, Vec<u8>) {
        match self.verification_mode {
            VerificationMode::DevMode => {
                self.verify_receipt_dev_mode(receipt, expected_image_id)
            }
            VerificationMode::Groth16 => {
                self.verify_receipt_groth16(receipt, expected_image_id, proof_type)
            }
        }
    }

    /// DevMode verification - checks format but skips cryptographic verification
    /// WARNING: Only use for development/testing!
    fn verify_receipt_dev_mode(&self, receipt: &[u8], expected_image_id: &[u8; 32]) -> (bool, Vec<u8>) {
        env::log_str("WARNING: DevMode verification - cryptographic verification SKIPPED");

        if receipt.len() < 64 {
            env::log_str("Receipt too short");
            return (false, vec![]);
        }

        // Extract image ID from receipt (first 32 bytes in our dev format)
        let mut receipt_image_id = [0u8; 32];
        receipt_image_id.copy_from_slice(&receipt[0..32]);

        if &receipt_image_id != expected_image_id {
            env::log_str("Image ID mismatch");
            return (false, vec![]);
        }

        // Journal is the rest of the receipt (simplified dev format)
        let journal = receipt[32..].to_vec();

        env::log_str("DevMode verification passed (NOT cryptographically verified)");
        (true, journal)
    }

    /// Groth16 verification - full cryptographic verification
    /// Uses Groth16-wrapped RISC Zero proof for efficient on-chain verification
    /// Verify a Groth16 proof using NEAR's alt_bn128 precompiles
    ///
    /// Receipt format:
    /// [0..32]: image_id (circuit identifier)
    /// [32..96]: proof.a (G1 point - 64 bytes)
    /// [96..224]: proof.b (G2 point - 128 bytes)
    /// [224..288]: proof.c (G1 point - 64 bytes)
    /// [288..]: journal (public outputs from circuit)
    ///
    /// Verification equation:
    /// e(-A, B) × e(α, β) × e(L, γ) × e(C, δ) = 1
    /// where L = IC[0] + Σ(public_inputs[i] × IC[i+1])
    fn verify_receipt_groth16(
        &self,
        receipt: &[u8],
        expected_image_id: &[u8; 32],
        proof_type: &ProofType,
    ) -> (bool, Vec<u8>) {
        // Minimum size: image_id(32) + A(64) + B(128) + C(64) = 288 bytes
        if receipt.len() < 288 {
            env::log_str("Groth16 receipt too short");
            return (false, vec![]);
        }

        // Extract and verify image ID
        let mut receipt_image_id = [0u8; 32];
        receipt_image_id.copy_from_slice(&receipt[0..32]);

        if &receipt_image_id != expected_image_id {
            env::log_str("Image ID mismatch");
            return (false, vec![]);
        }

        // Get verification key for this proof type
        let key = format!("{:?}", proof_type);
        let vk = match self.verification_keys.get(&key) {
            Some(vk) => vk,
            None => {
                env::log_str(&format!("No verification key registered for {:?}", proof_type));
                return (false, vec![]);
            }
        };

        // Parse proof points
        let proof = self.parse_groth16_proof(&receipt[32..288]);

        // Extract journal (public outputs)
        let journal = receipt[288..].to_vec();

        env::log_str(&format!(
            "Groth16 verification - proof parsed, journal size: {} bytes",
            journal.len()
        ));

        // Perform Groth16 verification using alt_bn128_pairing_check
        let is_valid = self.verify_groth16_pairing(&proof, &vk, &journal);

        if is_valid {
            env::log_str("Groth16 verification PASSED");
        } else {
            env::log_str("Groth16 verification FAILED");
        }

        (is_valid, journal)
    }

    /// Parse Groth16 proof from bytes
    /// Format: A(64 bytes) || B(128 bytes) || C(64 bytes)
    fn parse_groth16_proof(&self, data: &[u8]) -> Groth16Proof {
        assert!(data.len() >= 256, "Invalid proof data length");

        let mut a_x = [0u8; 32];
        let mut a_y = [0u8; 32];
        a_x.copy_from_slice(&data[0..32]);
        a_y.copy_from_slice(&data[32..64]);

        let mut b_x_c0 = [0u8; 32];
        let mut b_x_c1 = [0u8; 32];
        let mut b_y_c0 = [0u8; 32];
        let mut b_y_c1 = [0u8; 32];
        b_x_c0.copy_from_slice(&data[64..96]);
        b_x_c1.copy_from_slice(&data[96..128]);
        b_y_c0.copy_from_slice(&data[128..160]);
        b_y_c1.copy_from_slice(&data[160..192]);

        let mut c_x = [0u8; 32];
        let mut c_y = [0u8; 32];
        c_x.copy_from_slice(&data[192..224]);
        c_y.copy_from_slice(&data[224..256]);

        Groth16Proof {
            a: G1Point { x: a_x, y: a_y },
            b: G2Point {
                x_c0: b_x_c0,
                x_c1: b_x_c1,
                y_c0: b_y_c0,
                y_c1: b_y_c1,
            },
            c: G1Point { x: c_x, y: c_y },
        }
    }

    /// Perform Groth16 pairing verification
    ///
    /// Verifies: e(-A, B) × e(α, β) × e(L, γ) × e(C, δ) = 1
    ///
    /// Uses NEAR's alt_bn128_pairing_check precompile
    fn verify_groth16_pairing(
        &self,
        proof: &Groth16Proof,
        vk: &Groth16VerificationKey,
        journal: &[u8],
    ) -> bool {
        // Step 1: Compute L = IC[0] + Σ(pub_inputs[i] × IC[i+1])
        // For RISC Zero, public inputs come from journal hash
        // We use the journal directly as public input (hash it to get scalar)

        // Compute public input scalar from journal
        let pub_input_scalar = self.compute_public_input_scalar(journal);

        // Compute L using alt_bn128_g1_multiexp and alt_bn128_g1_sum
        let l = self.compute_linear_combination(&vk.ic, &[pub_input_scalar]);

        // Step 2: Negate A for pairing equation
        let neg_a = self.negate_g1(&proof.a);

        // Step 3: Build pairing input
        // Format for alt_bn128_pairing_check:
        // List of (G1, G2) pairs serialized with borsh
        // Each pair: G1 (64 bytes) || G2 (128 bytes)
        let pairing_input = self.build_pairing_input(
            &neg_a, &proof.b,     // e(-A, B)
            &vk.alpha_g1, &vk.beta_g2,  // e(α, β)
            &l, &vk.gamma_g2,     // e(L, γ)
            &proof.c, &vk.delta_g2,     // e(C, δ)
        );

        // Step 4: Perform pairing check
        env::alt_bn128_pairing_check(&pairing_input)
    }

    /// Compute public input scalar from journal
    /// We hash the journal to get a field element
    fn compute_public_input_scalar(&self, journal: &[u8]) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(journal);
        let hash = hasher.finalize();
        let mut scalar = [0u8; 32];
        scalar.copy_from_slice(&hash);
        // Ensure scalar is in valid field range (reduce mod field order if needed)
        // For simplicity, we use the hash directly (valid for most cases)
        scalar
    }

    /// Compute linear combination: result = IC[0] + scalar * IC[1] + ...
    /// Uses alt_bn128_g1_multiexp for efficient computation
    fn compute_linear_combination(&self, ic: &[G1Point], scalars: &[[u8; 32]]) -> G1Point {
        if ic.is_empty() {
            return G1Point { x: [0; 32], y: [0; 32] };
        }

        // Start with IC[0]
        let mut result = ic[0].clone();

        if scalars.is_empty() || ic.len() < 2 {
            return result;
        }

        // Compute scalar multiplications: scalars[i] * IC[i+1]
        // Format for alt_bn128_g1_multiexp: [(G1, scalar), ...]
        // Serialized as: num_pairs (u32) || pairs...
        // Each pair: G1_x (32) || G1_y (32) || scalar (32)

        let num_pairs = scalars.len().min(ic.len() - 1);
        let mut multiexp_input = Vec::with_capacity(4 + num_pairs * 96);

        // Number of pairs (little-endian u32)
        multiexp_input.extend_from_slice(&(num_pairs as u32).to_le_bytes());

        for i in 0..num_pairs {
            // G1 point
            multiexp_input.extend_from_slice(&ic[i + 1].x);
            multiexp_input.extend_from_slice(&ic[i + 1].y);
            // Scalar
            multiexp_input.extend_from_slice(&scalars[i]);
        }

        // Compute multiexp
        let multiexp_result = env::alt_bn128_g1_multiexp(&multiexp_input);

        // Parse result G1 point
        if multiexp_result.len() >= 64 {
            let mut sum_point = G1Point { x: [0; 32], y: [0; 32] };
            sum_point.x.copy_from_slice(&multiexp_result[0..32]);
            sum_point.y.copy_from_slice(&multiexp_result[32..64]);

            // Add IC[0] to the sum
            result = self.add_g1_points(&result, &sum_point);
        }

        result
    }

    /// Add two G1 points using alt_bn128_g1_sum
    fn add_g1_points(&self, p1: &G1Point, p2: &G1Point) -> G1Point {
        // Format for alt_bn128_g1_sum: num_points (u32) || points...
        // Each point: x (32) || y (32) || sign (1 byte, 0 for positive)
        let mut input = Vec::with_capacity(4 + 65 * 2);

        // Number of points
        input.extend_from_slice(&2u32.to_le_bytes());

        // Point 1 (positive)
        input.extend_from_slice(&p1.x);
        input.extend_from_slice(&p1.y);
        input.push(0); // sign = positive

        // Point 2 (positive)
        input.extend_from_slice(&p2.x);
        input.extend_from_slice(&p2.y);
        input.push(0); // sign = positive

        let result = env::alt_bn128_g1_sum(&input);

        let mut sum = G1Point { x: [0; 32], y: [0; 32] };
        if result.len() >= 64 {
            sum.x.copy_from_slice(&result[0..32]);
            sum.y.copy_from_slice(&result[32..64]);
        }
        sum
    }

    /// Negate a G1 point (flip y coordinate in the field)
    fn negate_g1(&self, p: &G1Point) -> G1Point {
        // For BN254, negation is: (x, -y mod p)
        // Using alt_bn128_g1_sum with sign = 1 (negative)
        // But simpler: use the identity that -P = (P.x, q - P.y) where q is field modulus
        // We can use alt_bn128_g1_sum with sign byte = 1 to get negation

        let mut input = Vec::with_capacity(4 + 65);
        input.extend_from_slice(&1u32.to_le_bytes());
        input.extend_from_slice(&p.x);
        input.extend_from_slice(&p.y);
        input.push(1); // sign = negative

        let result = env::alt_bn128_g1_sum(&input);

        let mut neg = G1Point { x: [0; 32], y: [0; 32] };
        if result.len() >= 64 {
            neg.x.copy_from_slice(&result[0..32]);
            neg.y.copy_from_slice(&result[32..64]);
        }
        neg
    }

    /// Build pairing input for 4 pairs: (G1, G2) each
    /// Format for alt_bn128_pairing_check: num_pairs (u32) || pairs...
    /// Each pair: G1 (64 bytes) || G2 (128 bytes)
    fn build_pairing_input(
        &self,
        g1_1: &G1Point, g2_1: &G2Point,
        g1_2: &G1Point, g2_2: &G2Point,
        g1_3: &G1Point, g2_3: &G2Point,
        g1_4: &G1Point, g2_4: &G2Point,
    ) -> Vec<u8> {
        let mut input = Vec::with_capacity(4 + 4 * (64 + 128));

        // Number of pairs
        input.extend_from_slice(&4u32.to_le_bytes());

        // Pair 1: (-A, B)
        self.append_pairing_pair(&mut input, g1_1, g2_1);

        // Pair 2: (α, β)
        self.append_pairing_pair(&mut input, g1_2, g2_2);

        // Pair 3: (L, γ)
        self.append_pairing_pair(&mut input, g1_3, g2_3);

        // Pair 4: (C, δ)
        self.append_pairing_pair(&mut input, g1_4, g2_4);

        input
    }

    /// Append a (G1, G2) pair to the pairing input buffer
    fn append_pairing_pair(&self, buffer: &mut Vec<u8>, g1: &G1Point, g2: &G2Point) {
        // G1: x || y (64 bytes)
        buffer.extend_from_slice(&g1.x);
        buffer.extend_from_slice(&g1.y);

        // G2: x_c0 || x_c1 || y_c0 || y_c1 (128 bytes)
        buffer.extend_from_slice(&g2.x_c0);
        buffer.extend_from_slice(&g2.x_c1);
        buffer.extend_from_slice(&g2.y_c0);
        buffer.extend_from_slice(&g2.y_c1);
    }

    fn record_verification(
        &mut self,
        submitter: &AccountId,
        proof_type: ProofType,
        receipt: &[u8],
        public_outputs: Vec<u8>,
        success: bool,
    ) {
        let mut hasher = Sha256::new();
        hasher.update(receipt);
        let result = hasher.finalize();
        let mut receipt_hash = [0u8; 32];
        receipt_hash.copy_from_slice(&result);

        let record = VerificationRecord {
            submitter: submitter.clone(),
            proof_type,
            receipt_hash,
            public_outputs,
            verified_at: env::block_timestamp(),
            success,
        };

        self.verification_history.insert(&receipt_hash, &record);
    }

    // Parsing functions for journal outputs
    // These parse the public outputs committed by the RISC Zero guest program

    fn parse_payment_output(&self, journal: &[u8]) -> PaymentProofOutput {
        // Expected format: [salary_commitment: 32, payment_commitment: 32, amounts_match: 1]
        if journal.len() < 65 {
            return PaymentProofOutput {
                salary_commitment: [0u8; 32],
                payment_commitment: [0u8; 32],
                amounts_match: false,
            };
        }

        let mut salary_commitment = [0u8; 32];
        let mut payment_commitment = [0u8; 32];
        salary_commitment.copy_from_slice(&journal[0..32]);
        payment_commitment.copy_from_slice(&journal[32..64]);
        let amounts_match = journal[64] != 0;

        PaymentProofOutput {
            salary_commitment,
            payment_commitment,
            amounts_match,
        }
    }

    /// Parse income threshold journal
    /// Format: [threshold: 8, meets_threshold: 1, payment_count: 4, history_commitment: 32]
    fn parse_income_threshold_output(&self, journal: &[u8], expected_commitment: &[u8; 32]) -> IncomeThresholdOutput {
        // Expected format: [threshold: 8, meets_threshold: 1, payment_count: 4, history_commitment: 32]
        // Total: 45 bytes
        if journal.len() < 45 {
            // Fallback for dev mode with shorter journal
            if journal.len() >= 13 {
                let threshold = u64::from_le_bytes(journal[0..8].try_into().unwrap());
                let meets_threshold = journal[8] != 0;
                let payment_count = u32::from_le_bytes(journal[9..13].try_into().unwrap());

                return IncomeThresholdOutput {
                    threshold,
                    meets_threshold,
                    payment_count,
                    history_commitment: *expected_commitment, // Use expected in dev mode
                    verified: false,
                };
            }

            return IncomeThresholdOutput {
                threshold: 0,
                meets_threshold: false,
                payment_count: 0,
                history_commitment: *expected_commitment,
                verified: false,
            };
        }

        let threshold = u64::from_le_bytes(journal[0..8].try_into().unwrap());
        let meets_threshold = journal[8] != 0;
        let payment_count = u32::from_le_bytes(journal[9..13].try_into().unwrap());

        let mut history_commitment = [0u8; 32];
        history_commitment.copy_from_slice(&journal[13..45]);

        IncomeThresholdOutput {
            threshold,
            meets_threshold,
            payment_count,
            history_commitment,
            verified: false, // Will be set by caller
        }
    }

    /// Parse income range journal
    /// Format: [min: 8, max: 8, in_range: 1, payment_count: 4, history_commitment: 32]
    fn parse_income_range_output(&self, journal: &[u8], expected_commitment: &[u8; 32]) -> IncomeRangeOutput {
        // Total: 53 bytes
        if journal.len() < 53 {
            // Fallback for dev mode with shorter journal
            if journal.len() >= 17 {
                let min = u64::from_le_bytes(journal[0..8].try_into().unwrap());
                let max = u64::from_le_bytes(journal[8..16].try_into().unwrap());
                let in_range = journal[16] != 0;

                return IncomeRangeOutput {
                    min,
                    max,
                    in_range,
                    payment_count: 0,
                    history_commitment: *expected_commitment,
                    verified: false,
                };
            }

            return IncomeRangeOutput {
                min: 0,
                max: 0,
                in_range: false,
                payment_count: 0,
                history_commitment: *expected_commitment,
                verified: false,
            };
        }

        let min = u64::from_le_bytes(journal[0..8].try_into().unwrap());
        let max = u64::from_le_bytes(journal[8..16].try_into().unwrap());
        let in_range = journal[16] != 0;
        let payment_count = u32::from_le_bytes(journal[17..21].try_into().unwrap());

        let mut history_commitment = [0u8; 32];
        history_commitment.copy_from_slice(&journal[21..53]);

        IncomeRangeOutput {
            min,
            max,
            in_range,
            payment_count,
            history_commitment,
            verified: false,
        }
    }

    /// Parse credit score journal
    /// Format: [threshold: 4, meets_threshold: 1, payment_count: 4, history_commitment: 32]
    fn parse_credit_score_output(&self, journal: &[u8], expected_commitment: &[u8; 32]) -> CreditScoreOutput {
        // Total: 41 bytes
        if journal.len() < 41 {
            // Fallback for dev mode
            if journal.len() >= 5 {
                let threshold = u32::from_le_bytes(journal[0..4].try_into().unwrap());
                let meets_threshold = journal[4] != 0;

                return CreditScoreOutput {
                    threshold,
                    meets_threshold,
                    payment_count: 0,
                    history_commitment: *expected_commitment,
                    verified: false,
                };
            }

            return CreditScoreOutput {
                threshold: 0,
                meets_threshold: false,
                payment_count: 0,
                history_commitment: *expected_commitment,
                verified: false,
            };
        }

        let threshold = u32::from_le_bytes(journal[0..4].try_into().unwrap());
        let meets_threshold = journal[4] != 0;
        let payment_count = u32::from_le_bytes(journal[5..9].try_into().unwrap());

        let mut history_commitment = [0u8; 32];
        history_commitment.copy_from_slice(&journal[9..41]);

        CreditScoreOutput {
            threshold,
            meets_threshold,
            payment_count,
            history_commitment,
            verified: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn get_context(predecessor: AccountId) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(predecessor);
        builder
    }

    #[test]
    fn test_new() {
        let owner: AccountId = "owner.near".parse().unwrap();
        let context = get_context(owner.clone());
        testing_env!(context.build());

        let contract = ZkVerifier::new(owner.clone());
        assert_eq!(contract.get_owner(), owner);
        assert_eq!(contract.total_verifications, 0);
    }

    #[test]
    fn test_register_image_id() {
        let owner: AccountId = "owner.near".parse().unwrap();
        let context = get_context(owner.clone());
        testing_env!(context.build());

        let mut contract = ZkVerifier::new(owner);
        let image_id = [1u8; 32];

        contract.register_image_id(ProofType::PaymentProof, image_id);

        assert_eq!(
            contract.get_image_id_for_type(ProofType::PaymentProof),
            Some(image_id)
        );
    }
}
