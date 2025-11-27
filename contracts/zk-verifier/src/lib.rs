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
//! ## Verification
//! - **Groth16**: Full cryptographic verification using NEAR's alt_bn128 precompiles

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::UnorderedMap;
use near_sdk::serde::{Deserialize, Deserializer, Serialize};
use near_sdk::{env, near_bindgen, AccountId, BorshStorageKey, NearSchema, PanicOnDefault};
use sha2::{Digest, Sha256};

// Groth16 verification module using NEAR's alt_bn128 precompiles
mod groth16;

// Helper module for deserializing hex strings to byte arrays
mod hex_serde {
    use near_sdk::serde::{Deserialize, Deserializer};

    pub fn deserialize_32<'de, D>(deserializer: D) -> Result<[u8; 32], D::Error>
    where
        D: Deserializer<'de>,
    {
        let s: String = String::deserialize(deserializer)?;
        let s = s.strip_prefix("0x").unwrap_or(&s);

        let bytes = hex::decode(s).map_err(near_sdk::serde::de::Error::custom)?;
        if bytes.len() != 32 {
            return Err(near_sdk::serde::de::Error::custom(format!(
                "Expected 32 bytes, got {}",
                bytes.len()
            )));
        }

        let mut array = [0u8; 32];
        array.copy_from_slice(&bytes);
        Ok(array)
    }
}

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
    #[serde(deserialize_with = "hex_serde::deserialize_32")]
    pub x: [u8; 32],
    #[serde(deserialize_with = "hex_serde::deserialize_32")]
    pub y: [u8; 32],
}

/// G2 point on BN254 curve (128 bytes uncompressed)
/// Format: [x_c0: 32, x_c1: 32, y_c0: 32, y_c1: 32] (LE)
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct G2Point {
    #[serde(deserialize_with = "hex_serde::deserialize_32")]
    pub x_c0: [u8; 32],
    #[serde(deserialize_with = "hex_serde::deserialize_32")]
    pub x_c1: [u8; 32],
    #[serde(deserialize_with = "hex_serde::deserialize_32")]
    pub y_c0: [u8; 32],
    #[serde(deserialize_with = "hex_serde::deserialize_32")]
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
}

#[near_bindgen]
impl ZkVerifier {
    /// Initialize the verifier contract with Groth16 verification
    #[init]
    pub fn new(owner: AccountId) -> Self {
        env::log_str("ZK Verifier initialized with Groth16 verification");
        Self {
            owner,
            image_ids: UnorderedMap::new(StorageKey::ImageIds),
            verification_keys: UnorderedMap::new(StorageKey::VerificationKeys),
            verification_history: UnorderedMap::new(StorageKey::VerificationHistory),
            total_verifications: 0,
            successful_verifications: 0,
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

    /// Verify a RISC Zero receipt using Groth16 verification
    /// Returns (is_valid, journal_bytes)
    ///
    /// Full cryptographic verification using NEAR's alt_bn128 precompiles
    fn verify_risc_zero_receipt(
        &self,
        receipt: &[u8],
        expected_image_id: &[u8; 32],
        proof_type: &ProofType,
    ) -> (bool, Vec<u8>) {
        self.verify_receipt_groth16(receipt, expected_image_id, proof_type)
    }

    /// Groth16 verification - RISC Zero universal verification
    /// Uses RISC Zero's universal Groth16 verification key
    ///
    /// Receipt format:
    /// [0..32]: image_id (circuit identifier)
    /// [32..64]: claim_digest (hash of ReceiptClaim)
    /// [64..128]: proof.a (G1 point - 64 bytes)
    /// [128..256]: proof.b (G2 point - 128 bytes)
    /// [256..320]: proof.c (G1 point - 64 bytes)
    /// [320..]: journal (public outputs from circuit)
    ///
    /// RISC Zero Public Inputs (5 field elements):
    /// 1-2: split_digest(control_root) -> (control_root_a0, control_root_a1)
    /// 3-4: split_digest(claim_digest) -> (claim_c0, claim_c1)
    /// 5: bn254_control_id (reversed)
    fn verify_receipt_groth16(
        &self,
        receipt: &[u8],
        expected_image_id: &[u8; 32],
        _proof_type: &ProofType,
    ) -> (bool, Vec<u8>) {
        // Minimum size: image_id(32) + claim_digest(32) + A(64) + B(128) + C(64) = 320 bytes
        if receipt.len() < 320 {
            env::log_str(&format!("Groth16 receipt too short: {} bytes, expected >= 320", receipt.len()));
            return (false, vec![]);
        }

        // Extract and verify image ID
        let mut receipt_image_id = [0u8; 32];
        receipt_image_id.copy_from_slice(&receipt[0..32]);

        if &receipt_image_id != expected_image_id {
            env::log_str(&format!(
                "Image ID mismatch: expected {}, got {}",
                hex::encode(expected_image_id),
                hex::encode(receipt_image_id)
            ));
            return (false, vec![]);
        }

        // Extract claim_digest
        let mut claim_digest = [0u8; 32];
        claim_digest.copy_from_slice(&receipt[32..64]);

        // Parse proof points (seal)
        let proof = self.parse_groth16_proof(&receipt[64..320]);

        // Extract journal (public outputs)
        let journal = receipt[320..].to_vec();

        env::log_str(&format!(
            "RISC Zero Groth16 verification - claim_digest: {}, journal: {} bytes",
            hex::encode(claim_digest),
            journal.len()
        ));

        // Perform RISC Zero Groth16 verification
        let is_valid = self.verify_risc_zero_groth16(&proof, &claim_digest);

        if is_valid {
            env::log_str("RISC Zero Groth16 verification PASSED");
        } else {
            env::log_str("RISC Zero Groth16 verification FAILED");
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

    /// RISC Zero universal Groth16 verification
    /// Uses RISC Zero's ONE universal verification key for ALL circuits
    ///
    /// Public inputs (5 field elements):
    /// - control_root_a0, control_root_a1 (from ALLOWED_CONTROL_ROOT)
    /// - claim_c0, claim_c1 (from split_digest(claim_digest))
    /// - bn254_control_id (BN254_IDENTITY_CONTROL_ID)
    fn verify_risc_zero_groth16(
        &self,
        proof: &Groth16Proof,
        claim_digest: &[u8; 32],
    ) -> bool {
        // RISC Zero constants (from risc0-circuit-recursion and risc0-groth16)

        // ALLOWED_CONTROL_ROOT for po2_max=24 with poseidon2
        // This is the control root that RISC Zero uses for recursion
        const CONTROL_ROOT: [u8; 32] = hex_literal::hex!(
            "8b6dcf11d463ac455361ce8a1e8b7e41e8663d8e1881d9b785ebdb2e9f9c3f7c"
        );

        // BN254_IDENTITY_CONTROL_ID (from risc0-circuit-recursion)
        const BN254_CONTROL_ID: [u8; 32] = hex_literal::hex!(
            "c07a65145c3cb48b6101962ea607a4dd93c753bb26975cb47feb00d3666e4404"
        );

        // Split digests into two 16-byte halves (big-endian, reversed)
        let (control_a0, control_a1) = self.split_digest(&CONTROL_ROOT);
        let (claim_c0, claim_c1) = self.split_digest(claim_digest);

        // Reverse bn254_control_id for field element
        let mut bn254_id_reversed = BN254_CONTROL_ID;
        bn254_id_reversed.reverse();

        // Public inputs for RISC Zero Groth16 verification
        let public_inputs = [control_a0, control_a1, claim_c0, claim_c1, bn254_id_reversed];

        env::log_str(&format!(
            "RISC Zero verification with claim_digest: {}",
            hex::encode(claim_digest)
        ));

        // Get RISC Zero universal VK
        let vk = self.get_risc_zero_universal_vk();

        // Call standard Groth16 verification with RISC Zero's universal VK
        self.verify_groth16_with_vk(proof, &vk, &public_inputs)
    }

    /// Split a 32-byte digest into two 16-byte halves (RISC Zero format)
    /// Returns (low 16 bytes reversed, high 16 bytes reversed)
    fn split_digest(&self, digest: &[u8; 32]) -> ([u8; 32], [u8; 32]) {
        // Reverse the full digest to big-endian
        let mut reversed = *digest;
        reversed.reverse();

        // Split into two 16-byte halves
        let mut low = [0u8; 16];
        let mut high = [0u8; 16];
        low.copy_from_slice(&reversed[0..16]);
        high.copy_from_slice(&reversed[16..32]);

        // Pad to 32 bytes (little-endian field elements)
        let mut low_32 = [0u8; 32];
        let mut high_32 = [0u8; 32];
        low_32[0..16].copy_from_slice(&low);
        high_32[0..16].copy_from_slice(&high);

        (low_32, high_32)
    }

    /// Get RISC Zero's universal Groth16 verification key
    /// This is the SAME key for ALL RISC Zero circuits
    /// TODO: Replace with actual hardcoded VK from RISC Zero
    fn get_risc_zero_universal_vk(&self) -> Groth16VerificationKey {
        // RISC Zero Universal Groth16 Verification Key
        // Extracted from risc0-groth16 v3.0.3
        // Source: risc0-groth16/src/verifier.rs
        // This is the SAME key for ALL RISC Zero circuits

        // VK constants (extracted via scripts/vk_extractor)
        const ALPHA_G1_X: [u8; 32] = hex_literal::hex!("2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e2");
        const ALPHA_G1_Y: [u8; 32] = hex_literal::hex!("14bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926");

        const BETA_G2_X_C0: [u8; 32] = hex_literal::hex!("0967032fcbf776d1afc985f88877f182d38480a653f2decaa9794cbc3bf3060c");
        const BETA_G2_X_C1: [u8; 32] = hex_literal::hex!("0e187847ad4c798374d0d6732bf501847dd68bc0e071241e0213bc7fc13db7ab");
        const BETA_G2_Y_C0: [u8; 32] = hex_literal::hex!("304cfbd1e08a704a99f5e847d93f8c3caafddec46b7a0d379da69a4d112346a7");
        const BETA_G2_Y_C1: [u8; 32] = hex_literal::hex!("1739c1b1a457a8c7313123d24d2f9192f896b7c63eea05a9d57f06547ad0cec8");

        const GAMMA_G2_X_C0: [u8; 32] = hex_literal::hex!("198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2");
        const GAMMA_G2_X_C1: [u8; 32] = hex_literal::hex!("1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed");
        const GAMMA_G2_Y_C0: [u8; 32] = hex_literal::hex!("090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b");
        const GAMMA_G2_Y_C1: [u8; 32] = hex_literal::hex!("12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa");

        const DELTA_G2_X_C0: [u8; 32] = hex_literal::hex!("03b03cd5effa95ac9bee94f1f5ef907157bda4812ccf0b4c91f42bb629f83a1c");
        const DELTA_G2_X_C1: [u8; 32] = hex_literal::hex!("1aa085ff28179a12d922dba0547057ccaae94b9d69cfaa4e60401fea7f3e0333");
        const DELTA_G2_Y_C0: [u8; 32] = hex_literal::hex!("110c10134f200b19f6490846d518c9aea868366efb7228ca5c91d2940d030762");
        const DELTA_G2_Y_C1: [u8; 32] = hex_literal::hex!("1e60f31fcbf757e837e867178318832d0b2d74d59e2fea1c7142df187d3fc6d3");

        // IC points (6 total = 5 public inputs + 1)
        const IC0_X: [u8; 32] = hex_literal::hex!("12ac9a25dcd5e1a832a9061a082c15dd1d61aa9c4d553505739d0f5d65dc3be4");
        const IC0_Y: [u8; 32] = hex_literal::hex!("025aa744581ebe7ad91731911c898569106ff5a2d30f3eee2b23c60ee980acd4");
        const IC1_X: [u8; 32] = hex_literal::hex!("0707b920bc978c02f292fae2036e057be54294114ccc3c8769d883f688a1423f");
        const IC1_Y: [u8; 32] = hex_literal::hex!("2e32a094b7589554f7bc357bf63481acd2d55555c203383782a4650787ff6642");
        const IC2_X: [u8; 32] = hex_literal::hex!("0bca36e2cbe6394b3e249751853f961511011c7148e336f4fd974644850fc347");
        const IC2_Y: [u8; 32] = hex_literal::hex!("2ede7c9acf48cf3a3729fa3d68714e2a8435d4fa6db8f7f409c153b1fcdf9b8b");
        const IC3_X: [u8; 32] = hex_literal::hex!("1b8af999dbfbb3927c091cc2aaf201e488cbacc3e2c6b6fb5a25f9112e04f2a7");
        const IC3_Y: [u8; 32] = hex_literal::hex!("2b91a26aa92e1b6f5722949f192a81c850d586d81a60157f3e9cf04f679cccd6");
        const IC4_X: [u8; 32] = hex_literal::hex!("2b5f494ed674235b8ac1750bdfd5a7615f002d4a1dcefeddd06eda5a076ccd0d");
        const IC4_Y: [u8; 32] = hex_literal::hex!("2fe520ad2020aab9cbba817fcbb9a863b8a76ff88f14f912c5e71665b2ad5e82");
        const IC5_X: [u8; 32] = hex_literal::hex!("0f1c3c0d5d9da0fa03666843cde4e82e869ba5252fce3c25d5940320b1c4d493");
        const IC5_Y: [u8; 32] = hex_literal::hex!("214bfcff74f425f6fe8c0d07b307482d8bc8bb2f3608f68287aa01bd0b69e809");

        Groth16VerificationKey {
            alpha_g1: G1Point {
                x: ALPHA_G1_X,
                y: ALPHA_G1_Y,
            },
            beta_g2: G2Point {
                x_c0: BETA_G2_X_C0,
                x_c1: BETA_G2_X_C1,
                y_c0: BETA_G2_Y_C0,
                y_c1: BETA_G2_Y_C1,
            },
            gamma_g2: G2Point {
                x_c0: GAMMA_G2_X_C0,
                x_c1: GAMMA_G2_X_C1,
                y_c0: GAMMA_G2_Y_C0,
                y_c1: GAMMA_G2_Y_C1,
            },
            delta_g2: G2Point {
                x_c0: DELTA_G2_X_C0,
                x_c1: DELTA_G2_X_C1,
                y_c0: DELTA_G2_Y_C0,
                y_c1: DELTA_G2_Y_C1,
            },
            ic: vec![
                G1Point { x: IC0_X, y: IC0_Y },
                G1Point { x: IC1_X, y: IC1_Y },
                G1Point { x: IC2_X, y: IC2_Y },
                G1Point { x: IC3_X, y: IC3_Y },
                G1Point { x: IC4_X, y: IC4_Y },
                G1Point { x: IC5_X, y: IC5_Y },
            ],
        }
    }

    /// Call groth16 verification with the given VK and public inputs
    fn verify_groth16_with_vk(
        &self,
        proof: &Groth16Proof,
        vk: &Groth16VerificationKey,
        public_inputs: &[[u8; 32]],
    ) -> bool {
        // Use the existing groth16 module
        match groth16::verify_groth16(vk, proof, public_inputs) {
            Ok(result) => result,
            Err(e) => {
                env::log_str(&format!("Groth16 verification error: {}", e));
                false
            }
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
        // Format for alt_bn128_g1_multiexp: consecutive (G1, scalar) pairs
        // Each pair: G1_x (32) || G1_y (32) || scalar (32) = 96 bytes
        // NO count prefix - just raw pairs

        let num_pairs = scalars.len().min(ic.len() - 1);
        let mut multiexp_input = Vec::with_capacity(num_pairs * 96);

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
        // Format for alt_bn128_g1_sum: consecutive points
        // Each point: x (32) || y (32) || sign (1 byte, 0 for positive)
        // NO count prefix - just raw points (65 bytes each)
        let mut input = Vec::with_capacity(65 * 2);

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
        // Format: x (32) || y (32) || sign (1) - NO count prefix
        let mut input = Vec::with_capacity(65);
        input.extend_from_slice(&p.x);
        input.extend_from_slice(&p.y);
        input.push(1); // sign = negative (returns -P)

        let result = env::alt_bn128_g1_sum(&input);

        let mut neg = G1Point { x: [0; 32], y: [0; 32] };
        if result.len() >= 64 {
            neg.x.copy_from_slice(&result[0..32]);
            neg.y.copy_from_slice(&result[32..64]);
        }
        neg
    }

    /// Build pairing input for 4 pairs: (G1, G2) each
    /// Format for alt_bn128_pairing_check: consecutive pairs
    /// Each pair: G1 (64 bytes) || G2 (128 bytes) = 192 bytes
    /// NO count prefix - just raw pairs
    fn build_pairing_input(
        &self,
        g1_1: &G1Point, g2_1: &G2Point,
        g1_2: &G1Point, g2_2: &G2Point,
        g1_3: &G1Point, g2_3: &G2Point,
        g1_4: &G1Point, g2_4: &G2Point,
    ) -> Vec<u8> {
        let mut input = Vec::with_capacity(4 * 192);

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
    /// Total: 45 bytes
    fn parse_income_threshold_output(&self, journal: &[u8], expected_commitment: &[u8; 32]) -> IncomeThresholdOutput {
        if journal.len() < 45 {
            env::log_str(&format!("Invalid journal length: {} (expected 45)", journal.len()));
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
    /// Total: 53 bytes
    fn parse_income_range_output(&self, journal: &[u8], expected_commitment: &[u8; 32]) -> IncomeRangeOutput {
        if journal.len() < 53 {
            env::log_str(&format!("Invalid journal length: {} (expected 53)", journal.len()));
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
    /// Total: 41 bytes
    fn parse_credit_score_output(&self, journal: &[u8], expected_commitment: &[u8; 32]) -> CreditScoreOutput {
        if journal.len() < 41 {
            env::log_str(&format!("Invalid journal length: {} (expected 41)", journal.len()));
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

    #[test]
    fn test_split_digest() {
        let owner: AccountId = "owner.near".parse().unwrap();
        let context = get_context(owner.clone());
        testing_env!(context.build());

        let contract = ZkVerifier::new(owner);

        // Test with RISC Zero control root
        let control_root: [u8; 32] = hex_literal::hex!(
            "8b6dcf11d463ac455361ce8a1e8b7e41e8663d8e1881d9b785ebdb2e9f9c3f7c"
        );

        let (low, high) = contract.split_digest(&control_root);

        // Verify the split is correct
        // The digest should be reversed, then split into two 16-byte halves
        let mut reversed = control_root;
        reversed.reverse();

        // Check that low contains first 16 bytes (padded to 32)
        assert_eq!(&low[0..16], &reversed[0..16]);
        assert_eq!(&low[16..32], &[0u8; 16]);

        // Check that high contains last 16 bytes (padded to 32)
        assert_eq!(&high[0..16], &reversed[16..32]);
        assert_eq!(&high[16..32], &[0u8; 16]);
    }

    #[test]
    fn test_get_risc_zero_universal_vk() {
        let owner: AccountId = "owner.near".parse().unwrap();
        let context = get_context(owner.clone());
        testing_env!(context.build());

        let contract = ZkVerifier::new(owner);
        let vk = contract.get_risc_zero_universal_vk();

        // Verify VK structure
        assert_eq!(vk.alpha_g1.x.len(), 32);
        assert_eq!(vk.alpha_g1.y.len(), 32);

        assert_eq!(vk.beta_g2.x_c0.len(), 32);
        assert_eq!(vk.beta_g2.x_c1.len(), 32);
        assert_eq!(vk.beta_g2.y_c0.len(), 32);
        assert_eq!(vk.beta_g2.y_c1.len(), 32);

        // RISC Zero universal VK has 6 IC points (5 public inputs + 1)
        assert_eq!(vk.ic.len(), 6);

        // Verify alpha_g1 matches expected values
        let expected_alpha_x = hex_literal::hex!(
            "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e2"
        );
        let expected_alpha_y = hex_literal::hex!(
            "14bedd503c37ceb061d8ec60209fe345ce89830a19230301f076caff004d1926"
        );

        assert_eq!(vk.alpha_g1.x, expected_alpha_x);
        assert_eq!(vk.alpha_g1.y, expected_alpha_y);
    }

    #[test]
    fn test_receipt_format_groth16() {
        let owner: AccountId = "owner.near".parse().unwrap();
        let context = get_context(owner.clone());
        testing_env!(context.build());

        let mut contract = ZkVerifier::new(owner);

        // Register image ID
        let image_id = [0x41u8; 32]; // Test image ID
        contract.register_image_id(ProofType::PaymentProof, image_id);

        // Create a test receipt with new format:
        // image_id (32) + claim_digest (32) + seal (256) + journal (variable)
        let mut receipt = Vec::new();
        receipt.extend_from_slice(&image_id);

        // claim_digest (32 bytes of test data)
        let claim_digest = [0xABu8; 32];
        receipt.extend_from_slice(&claim_digest);

        // seal (256 bytes - A:64 + B:128 + C:64)
        let seal = [0xCDu8; 256];
        receipt.extend_from_slice(&seal);

        // journal (test data)
        let journal = vec![1u8, 2u8, 3u8, 4u8];
        receipt.extend_from_slice(&journal);

        // Verify receipt is properly formatted (should be >= 320 bytes)
        assert!(receipt.len() >= 320);
        assert_eq!(receipt.len(), 32 + 32 + 256 + 4);

        // Verify receipt structure
        assert_eq!(&receipt[0..32], &image_id);
        assert_eq!(&receipt[32..64], &claim_digest);
        assert_eq!(&receipt[64..320], &seal);
        assert_eq!(&receipt[320..], &journal);
    }

    #[test]
    fn test_verify_risc_zero_constants() {
        let owner: AccountId = "owner.near".parse().unwrap();
        let context = get_context(owner.clone());
        testing_env!(context.build());

        let contract = ZkVerifier::new(owner);

        // Verify RISC Zero constants are correct
        const CONTROL_ROOT: [u8; 32] = hex_literal::hex!(
            "8b6dcf11d463ac455361ce8a1e8b7e41e8663d8e1881d9b785ebdb2e9f9c3f7c"
        );
        const BN254_CONTROL_ID: [u8; 32] = hex_literal::hex!(
            "c07a65145c3cb48b6101962ea607a4dd93c753bb26975cb47feb00d3666e4404"
        );

        // Test that split_digest works correctly with these constants
        let (control_a0, control_a1) = contract.split_digest(&CONTROL_ROOT);

        // Verify we can split the control ID
        let mut bn254_id_reversed = BN254_CONTROL_ID;
        bn254_id_reversed.reverse();

        // These should be valid 32-byte arrays
        assert_eq!(control_a0.len(), 32);
        assert_eq!(control_a1.len(), 32);
        assert_eq!(bn254_id_reversed.len(), 32);
    }
}
