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
use near_sdk::serde::{Deserialize, Serialize};
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

        let mut bytes = hex::decode(s).map_err(near_sdk::serde::de::Error::custom)?;
        if bytes.len() != 32 {
            return Err(near_sdk::serde::de::Error::custom(format!(
                "Expected 32 bytes, got {}",
                bytes.len()
            )));
        }

        // CRITICAL: RISC Zero outputs big-endian hex, but NEAR's alt_bn128 interprets
        // the byte arrays as LITTLE-ENDIAN integers. We must reverse to convert.
        bytes.reverse();

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
        // RISC Zero journal has 144 bytes of metadata/header, then the actual committed data
        let full_journal = &receipt[320..];

        env::log_str(&format!(
            "Full journal length: {} bytes, first 16 bytes: {}",
            full_journal.len(),
            hex::encode(&full_journal[..full_journal.len().min(16)])
        ));

        let journal = if full_journal.len() > 144 {
            let extracted = full_journal[144..].to_vec();
            env::log_str(&format!(
                "Extracted journal (skipped 144 bytes): {} bytes, first 16: {}",
                extracted.len(),
                hex::encode(&extracted[..extracted.len().min(16)])
            ));
            extracted
        } else {
            full_journal.to_vec()
        };

        env::log_str(&format!(
            "RISC Zero Groth16 verification - claim_digest: {}, journal: {} bytes",
            hex::encode(claim_digest),
            journal.len()
        ));

        // Perform RISC Zero Groth16 verification
        // Pass the actual receipt_image_id, not a hardcoded constant (Bug #4 fix)
        let is_valid = self.verify_risc_zero_groth16(&proof, &receipt_image_id, &claim_digest);

        if is_valid {
            env::log_str("RISC Zero Groth16 verification PASSED");
        } else {
            env::log_str("RISC Zero Groth16 verification FAILED");
        }

        (is_valid, journal)
    }

    /// Parse Groth16 proof from bytes
    /// Format: A(64 bytes) || B(128 bytes) || C(64 bytes)
    ///
    /// NOTE: RISC Zero's Groth16 seal is encoded in BIG-ENDIAN format (confirmed in risc0-groth16 source).
    /// Parse Groth16 proof from receipt bytes
    ///
    /// EMPIRICALLY DETERMINED FORMAT (from systematic testing):
    /// - Component ordering: SWAP (c1,c0) - Receipt has c0||c1, but NEAR expects c1||c0
    /// - Byte endianness: NO REVERSAL - Use little-endian bytes as-is
    ///
    /// This is the ONLY configuration that passes NEAR's G2 point validation.
    fn parse_groth16_proof(&self, data: &[u8]) -> Groth16Proof {
        assert!(data.len() >= 256, "Invalid proof data length");

        env::log_str("=== PARSING GROTH16 PROOF ===");

        // Parse A (G1 point) - little-endian, no reversal
        let mut a_x = [0u8; 32];
        let mut a_y = [0u8; 32];
        a_x.copy_from_slice(&data[0..32]);
        a_y.copy_from_slice(&data[32..64]);

        env::log_str(&format!("A.x (LE): {}", hex::encode(&a_x[..8])));

        // Parse B (G2 point)
        // Receipt format: x_c1 || x_c0 || y_c1 || y_c0 (Ethereum format: [c1, c0])
        // NEAR expects: [c0, c1, c0, c1] - SO WE MUST SWAP!
        let mut b_x_c0 = [0u8; 32];
        let mut b_x_c1 = [0u8; 32];
        let mut b_y_c0 = [0u8; 32];
        let mut b_y_c1 = [0u8; 32];

        b_x_c0.copy_from_slice(&data[96..128]);   // SWAP: read x_c0 from position 2
        b_x_c1.copy_from_slice(&data[64..96]);    // SWAP: read x_c1 from position 1
        b_y_c0.copy_from_slice(&data[160..192]);  // SWAP: read y_c0 from position 4
        b_y_c1.copy_from_slice(&data[128..160]);  // SWAP: read y_c1 from position 3

        env::log_str(&format!("B.x_c0 (LE, swapped from pos 96): {}", hex::encode(&b_x_c0[..8])));

        // Parse C (G1 point) - little-endian, no reversal
        let mut c_x = [0u8; 32];
        let mut c_y = [0u8; 32];
        c_x.copy_from_slice(&data[192..224]);
        c_y.copy_from_slice(&data[224..256]);

        env::log_str(&format!("C.x (LE): {}", hex::encode(&c_x[..8])));

        env::log_str("=== PROOF PARSING COMPLETE ===");

        Groth16Proof {
            a: G1Point { x: a_x, y: a_y },
            b: G2Point {
                x_c0: b_x_c0, // SWAPPED: now contains x_c0 (imaginary) from position 96
                x_c1: b_x_c1, // SWAPPED: now contains x_c1 (real) from position 64
                y_c0: b_y_c0, // SWAPPED: now contains y_c0 (imaginary) from position 160
                y_c1: b_y_c1, // SWAPPED: now contains y_c1 (real) from position 128
            },
            c: G1Point { x: c_x, y: c_y },
        }
    }

    /// RISC Zero universal Groth16 verification
    /// Uses RISC Zero's ONE universal verification key for ALL circuits
    ///
    /// Public inputs (5 field elements):
    /// - control_root_a0, control_root_a1 (from image_id)
    /// - claim_c0, claim_c1 (from split_digest(claim_digest))
    /// - bn254_control_id (BN254_IDENTITY_CONTROL_ID)
    fn verify_risc_zero_groth16(
        &self,
        proof: &Groth16Proof,
        image_id: &[u8; 32],
        claim_digest: &[u8; 32],
    ) -> bool {
        // RISC Zero constants (from risc0-circuit-recursion and risc0-groth16)

        // BN254_IDENTITY_CONTROL_ID from risc0-circuit-recursion 4.0.3
        // NOTE: Original value c07a65145c3cb48b6101962ea607a4dd93c753bb26975cb47feb00d3666e4404
        // is >= BN254 Fr modulus. NEAR's alt_bn128 precompiles reject such values (unlike
        // Solidity which auto-reduces). We use the pre-reduced value which is equivalent
        // in Fr field arithmetic. RISC Zero's prover also reduces this internally.
        const BN254_CONTROL_ID: [u8; 32] = hex_literal::hex!(
            "2f4d79bbb8a7d40e3810c50b21839bc61b2b9ae1b96b0b00b4452017966e4401"
        );

        // Split digests into two 128-bit halves (as per RISC Zero Solidity verifier)
        // Use the ACTUAL image_id from the receipt, not a hardcoded constant
        let (control_a0, control_a1) = self.split_digest(image_id);
        let (claim_c0, claim_c1) = self.split_digest(claim_digest);

        // BN254_CONTROL_ID: reverse for little-endian (NEAR alt_bn128 format)
        let mut bn254_id = BN254_CONTROL_ID;
        bn254_id.reverse(); // Convert to little-endian
        let mut bn254_id_padded = [0u8; 32];
        bn254_id_padded.copy_from_slice(&bn254_id);

        // Public inputs for RISC Zero Groth16 verification (5 field elements)
        let public_inputs = [control_a0, control_a1, claim_c0, claim_c1, bn254_id_padded];

        env::log_str(&format!(
            "RISC Zero verification with claim_digest: {}",
            hex::encode(claim_digest)
        ));
        env::log_str(&format!(
            "Public inputs:\n  control_a0: {}\n  control_a1: {}\n  claim_c0: {}\n  claim_c1: {}\n  bn254_id: {}",
            hex::encode(&control_a0),
            hex::encode(&control_a1),
            hex::encode(&claim_c0),
            hex::encode(&claim_c1),
            hex::encode(&bn254_id_padded)
        ));

        // Get RISC Zero universal VK
        let vk = self.get_risc_zero_universal_vk();

        // Call standard Groth16 verification with RISC Zero's universal VK
        let result = self.verify_groth16_with_vk(proof, &vk, &public_inputs);
        env::log_str(&format!("Groth16 verification result: {}", result));
        result
    }

    /// Split a 32-byte digest into two 128-bit halves (RISC Zero format)
    /// Matches risc0-ethereum splitDigest() logic:
    /// 1. Treat digest as big-endian uint256
    /// 2. Take low 128 bits and high 128 bits
    /// 3. Return as little-endian 32-byte arrays for BN254
    fn split_digest(&self, digest: &[u8; 32]) -> ([u8; 32], [u8; 32]) {
        // Match RISC Zero's Solidity splitDigest() exactly
        // See: RiscZeroGroth16Verifier.sol lines 139-142
        //
        // Solidity code:
        //   uint256 reversed = reverseByteOrderUint256(uint256(digest));
        //   return (bytes16(uint128(reversed)), bytes16(uint128(reversed >> 128)));
        //
        // Key insight: Solidity's bytes16 → uint128 → uint256 produces big-endian.
        // NEAR expects little-endian field elements.
        // BUT: NEAR's alt_bn128 precompile handles the endianness conversion internally!
        // So we should NOT double-reverse. Just reverse once and split.

        let mut reversed = *digest;
        reversed.reverse(); // reverseByteOrderUint256

        let mut claim0 = [0u8; 32];
        let mut claim1 = [0u8; 32];

        // In big-endian uint256 representation of 'reversed':
        //   - uint128(reversed) = bytes[16..31] (lower 128 bits)
        //   - uint128(reversed >> 128) = bytes[0..15] (upper 128 bits)
        //
        // Copy these directly (no second reverse needed!)
        claim0[..16].copy_from_slice(&reversed[16..]);  // Lower 128 bits
        claim1[..16].copy_from_slice(&reversed[..16]);  // Upper 128 bits

        (claim0, claim1)
    }

    /// Get RISC Zero's universal Groth16 verification key
    /// This is the SAME key for ALL RISC Zero circuits
    fn get_risc_zero_universal_vk(&self) -> Groth16VerificationKey {
        // RISC Zero Universal Groth16 Verification Key
        // Extracted from risc0-groth16 v3.0.3
        // Source: risc0-groth16/src/verifier.rs
        // This is the SAME key for ALL RISC Zero circuits
        //
        // CRITICAL: All constants are REVERSED from big-endian (RISC Zero format)
        // to little-endian (NEAR alt_bn128 interpretation)
        // Generated via: node scripts/reverse_vk_constants.js

        // VK constants (REVERSED for NEAR little-endian interpretation)
        // RISC Zero v3.0.3 Universal Groth16 Verification Key
        // Converted from risc0-ethereum v3.0.0 Groth16Verifier.sol to little-endian
        // FIXED: Corrected G2 point component ordering based on RISC Zero types.rs conversion logic
        const ALPHA_G1_X: [u8; 32] = hex_literal::hex!("e2f26dbea299f5223b646cb1fb33eadb059d9407559d7441dfd902e3a79a4d2d");
        const ALPHA_G1_Y: [u8; 32] = hex_literal::hex!("26194d00ffca76f0010323190a8389ce45e39f2060ecd861b0ce373c50ddbe14");

        // VK G2 constants: c0 contains IMAGINARY (X2/Y2), c1 contains REAL (X1/Y1)
        // This matches NEAR's expected serialization format: imaginary || real
        const BETA_G2_X_C0: [u8; 32] = hex_literal::hex!("abb73dc17fbc13021e2471e0c08bd67d8401f52b73d6d07483794cad4778180e");  // x imaginary (BETA_X2)
        const BETA_G2_X_C1: [u8; 32] = hex_literal::hex!("0c06f33bbc4c79a9cadef253a68084d382f17788f885c9afd176f7cb2f036709");  // x real (BETA_X1)
        const BETA_G2_Y_C0: [u8; 32] = hex_literal::hex!("c8ced07a54067fd5a905ea3ec6b796f892912f4dd2233131c7a857a4b1c13917");  // y imaginary (BETA_Y2)
        const BETA_G2_Y_C1: [u8; 32] = hex_literal::hex!("a74623114d9aa69d370d7a6bc4defdaa3c8c3fd947e8f5994a708ae0d1fb4c30");  // y real (BETA_Y1)

        const GAMMA_G2_X_C0: [u8; 32] = hex_literal::hex!("edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018");  // x imaginary (GAMMA_X2)
        const GAMMA_G2_X_C1: [u8; 32] = hex_literal::hex!("c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e19");  // x real (GAMMA_X1)
        const GAMMA_G2_Y_C0: [u8; 32] = hex_literal::hex!("aa7dfa6601cce64c7bd3430c69e7d1e38f40cb8d8071ab4aeb6d8cdba55ec812");  // y imaginary (GAMMA_Y2)
        const GAMMA_G2_Y_C1: [u8; 32] = hex_literal::hex!("5b9722d1dcdaac55f38eb37033314bbc95330c69ad999eec75f05f58d0890609");  // y real (GAMMA_Y1)

        const DELTA_G2_X_C0: [u8; 32] = hex_literal::hex!("33033e7fea1f40604eaacf699d4be9aacc577054a0db22d9129a1728ff85a01a");  // x imaginary (DELTA_X2)
        const DELTA_G2_X_C1: [u8; 32] = hex_literal::hex!("1c3af829b62bf4914c0bcf2c81a4bd577190eff5f194ee9bac95faefd53cb003");  // x real (DELTA_X1)
        const DELTA_G2_Y_C0: [u8; 32] = hex_literal::hex!("d3c63f7d18df42711cea2f9ed5742d0b2d8318831767e837e857f7cb1ff3601e");  // y imaginary (DELTA_Y2)
        const DELTA_G2_Y_C1: [u8; 32] = hex_literal::hex!("6207030d94d2915cca2872fb6e3668a8aec918d5460849f6190b204f13100c11");  // y real (DELTA_Y1)

        // IC points (6 total = 5 public inputs + 1)
        const IC0_X: [u8; 32] = hex_literal::hex!("e43bdc655d0f9d730535554d9caa611ddd152c081a06a932a8e1d5dc259aac12");
        const IC0_Y: [u8; 32] = hex_literal::hex!("d4ac80e90ec6232bee3e0fd3a2f56f106985891c913117d97abe1e5844a75a02");
        const IC1_X: [u8; 32] = hex_literal::hex!("3f42a188f683d869873ccc4c119442e57b056e03e2fa92f2028c97bc20b90707");
        const IC1_Y: [u8; 32] = hex_literal::hex!("4266ff870765a482373803c25555d5d2ac8134f67b35bcf7549558b794a0322e");
        const IC2_X: [u8; 32] = hex_literal::hex!("47c30f85444697fdf436e348711c011115963f855197243e4b39e6cbe236ca0b");
        const IC2_Y: [u8; 32] = hex_literal::hex!("8b9bdffcb153c109f4f7b86dfad435842a4e71683dfa29373acf48cf9a7cde2e");
        const IC3_X: [u8; 32] = hex_literal::hex!("a7f2042e11f9255afbb6c6e2c3accb88e401f2aac21c097c92b3fbdb99f98a1b");
        const IC3_Y: [u8; 32] = hex_literal::hex!("d6cc9c674ff09c3e7f15601ad886d550c8812a199f9422576f1b2ea96aa2912b");
        const IC4_X: [u8; 32] = hex_literal::hex!("0dcd6c075ada6ed0ddfece1d4a2d005f61a7d5df0b75c18a5b2374d64e495f2b");
        const IC4_Y: [u8; 32] = hex_literal::hex!("825eadb26516e7c512f9148ff86fa7b863a8b9cb7f81bacbb9aa2020ad20e52f");
        const IC5_X: [u8; 32] = hex_literal::hex!("93d4c4b1200394d5253cce2f25a59b862ee8e4cd43686603faa09d5d0d3c1c0f");
        const IC5_Y: [u8; 32] = hex_literal::hex!("09e8690bbd01aa8782f608362fbbc88b2d4807b3070d8cfef625f474fffc4b21");

        // CRITICAL: VK constants above are stored in LITTLE-ENDIAN format (reversed).
        // NEAR's alt_bn128 precompiles expect LITTLE-ENDIAN.
        // Use the constants as-is (already in little-endian).
        //
        // EMPIRICALLY TESTED:
        // - VK G1 REVERSAL: FAILED with "invalid fq" error
        // - VK G1 NO REVERSAL: Use little-endian as-is

        Groth16VerificationKey {
            alpha_g1: G1Point {
                x: ALPHA_G1_X,  // Little-endian as-is
                y: ALPHA_G1_Y,  // Little-endian as-is
            },
            // VK G2 constants: Use as-is from Ethereum constants
            // These have: c0=imaginary, c1=real (Ethereum convention)
            // Proof B from RISC Zero has: c0=real, c1=imaginary
            // Swap will happen during serialization to normalize
            beta_g2: G2Point {
                x_c0: BETA_G2_X_C0,  // imaginary (from BETA_X2)
                x_c1: BETA_G2_X_C1,  // real (from BETA_X1)
                y_c0: BETA_G2_Y_C0,  // imaginary (from BETA_Y2)
                y_c1: BETA_G2_Y_C1,  // real (from BETA_Y1)
            },
            gamma_g2: G2Point {
                x_c0: GAMMA_G2_X_C0,  // imaginary
                x_c1: GAMMA_G2_X_C1,  // real
                y_c0: GAMMA_G2_Y_C0,  // imaginary
                y_c1: GAMMA_G2_Y_C1,  // real
            },
            delta_g2: G2Point {
                x_c0: DELTA_G2_X_C0,  // imaginary
                x_c1: DELTA_G2_X_C1,  // real
                y_c0: DELTA_G2_Y_C0,  // imaginary
                y_c1: DELTA_G2_Y_C1,  // real
            },
            ic: vec![
                G1Point { x: IC0_X, y: IC0_Y },  // Little-endian as-is
                G1Point { x: IC1_X, y: IC1_Y },  // Little-endian as-is
                G1Point { x: IC2_X, y: IC2_Y },  // Little-endian as-is
                G1Point { x: IC3_X, y: IC3_Y },  // Little-endian as-is
                G1Point { x: IC4_X, y: IC4_Y },  // Little-endian as-is
                G1Point { x: IC5_X, y: IC5_Y },  // Little-endian as-is
            ],
        }
    }

    /// Test VK G2 point validity by constructing a simple pairing check
    /// This helps debug G2 point format issues
    pub fn test_vk_g2_point(&self) -> bool {
        // VK beta_g2 constants
        const BETA_G2_X_C0: [u8; 32] = hex_literal::hex!("abb73dc17fbc13021e2471e0c08bd67d8401f52b73d6d07483794cad4778180e");
        const BETA_G2_X_C1: [u8; 32] = hex_literal::hex!("0c06f33bbc4c79a9cadef253a68084d382f17788f885c9afd176f7cb2f036709");
        const BETA_G2_Y_C0: [u8; 32] = hex_literal::hex!("c8ced07a54067fd5a905ea3ec6b796f892912f4dd2233131c7a857a4b1c13917");
        const BETA_G2_Y_C1: [u8; 32] = hex_literal::hex!("a74623114d9aa69d370d7a6bc4defdaa3c8c3fd947e8f5994a708ae0d1fb4c30");

        // Try to construct a pairing check with VK beta_g2
        // We'll use generator points for simplicity
        let mut pairing_input = Vec::with_capacity(192);

        // G1 generator: (1, 2)
        let g1_gen_x = [1u8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let g1_gen_y = [2u8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

        pairing_input.extend_from_slice(&g1_gen_x);
        pairing_input.extend_from_slice(&g1_gen_y);

        // VK G2 constants already have c0 = imaginary, c1 = real
        // Serialize as c0, c1 (NO SWAP) to send imaginary || real to NEAR
        pairing_input.extend_from_slice(&BETA_G2_X_C0);  // imaginary (stored in c0)
        pairing_input.extend_from_slice(&BETA_G2_X_C1);  // real (stored in c1)
        pairing_input.extend_from_slice(&BETA_G2_Y_C0);  // imaginary (stored in c0)
        pairing_input.extend_from_slice(&BETA_G2_Y_C1);  // real (stored in c1)

        env::log_str("=== TESTING VK BETA_G2 POINT ===");
        env::log_str(&format!("Input length: {} bytes", pairing_input.len()));
        env::log_str(&format!("beta_g2.x_c0 (imag): {}", hex::encode(&BETA_G2_X_C0[..8])));
        env::log_str(&format!("beta_g2.x_c1 (real): {}", hex::encode(&BETA_G2_X_C1[..8])));

        // alt_bn128_pairing_check returns bool, will panic if G2 point is invalid
        let result = env::alt_bn128_pairing_check(&pairing_input);
        env::log_str(&format!("VK beta_g2 validation: {} (pairing result: {})",
            if result { "SUCCESS" } else { "SUCCESS (pairing=false)" },
            result));

        // Return true if we got here without panic (meaning G2 point is valid)
        true
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
    #[allow(dead_code)]
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

    #[allow(dead_code)]
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
    #[allow(dead_code)]
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
    #[allow(dead_code)]
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

    #[allow(dead_code)]
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
    #[allow(dead_code)]
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
        // Send as-is - NO SWAP during serialization
        // Proof.b already has SWAP during parsing (groth16.rs)
        // VK G2 has NO SWAP (used as-is from constants)
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
        // RISC Zero journal format: threshold(8) + meets_threshold(4 as u32!) + payment_count(4) + commitment(32) = 48 bytes
        if journal.len() < 48 {
            env::log_str(&format!("Invalid journal length: {} (expected 48)", journal.len()));
            return IncomeThresholdOutput {
                threshold: 0,
                meets_threshold: false,
                payment_count: 0,
                history_commitment: *expected_commitment,
                verified: false,
            };
        }

        let threshold = u64::from_le_bytes(journal[0..8].try_into().unwrap());
        let meets_threshold = u32::from_le_bytes(journal[8..12].try_into().unwrap()) != 0;  // bool serialized as u32!
        let payment_count = u32::from_le_bytes(journal[12..16].try_into().unwrap());

        let mut history_commitment = [0u8; 32];
        history_commitment.copy_from_slice(&journal[16..48]);

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

        // CRITICAL: Verify outputs are valid BN254 field elements
        // BN254 field modulus: 21888242871839275222246405745257275088548364400416034343698204186575808495617
        // As little-endian bytes (for comparison):
        let bn254_modulus = num_bigint::BigUint::from_bytes_le(&hex_literal::hex!(
            "010000f093f5e1439170b97948e833285d588181b64550b829a031e1724e6430"
        ));

        // Convert our outputs to BigUint for comparison
        let low_value = num_bigint::BigUint::from_bytes_le(&low);
        let high_value = num_bigint::BigUint::from_bytes_le(&high);

        // Both must be less than the BN254 field modulus
        assert!(
            low_value < bn254_modulus,
            "Low 128 bits exceed BN254 field modulus: {} >= {}",
            low_value,
            bn254_modulus
        );
        assert!(
            high_value < bn254_modulus,
            "High 128 bits exceed BN254 field modulus: {} >= {}",
            high_value,
            bn254_modulus
        );

        // Additional sanity check: 128-bit values should always be < BN254 modulus
        // since BN254 modulus is ~254 bits
        assert!(
            low_value < (num_bigint::BigUint::from(1u128) << 128),
            "Low value should fit in 128 bits"
        );
        assert!(
            high_value < (num_bigint::BigUint::from(1u128) << 128),
            "High value should fit in 128 bits"
        );
    }

    #[test]
    fn test_split_digest_matches_solidity() {
        // This test ensures our Rust implementation matches RISC Zero's Solidity verifier
        // Reference: risc0-ethereum/contracts/src/groth16/RiscZeroGroth16Verifier.sol
        let owner: AccountId = "owner.near".parse().unwrap();
        let context = get_context(owner.clone());
        testing_env!(context.build());

        let contract = ZkVerifier::new(owner);

        // Test with known digest
        let test_digest: [u8; 32] = hex_literal::hex!(
            "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
        );

        let (low, high) = contract.split_digest(&test_digest);

        // Expected behavior (matching Solidity):
        // 1. Reverse entire digest (treat as big-endian number, convert to little-endian)
        // 2. Low = first 16 bytes (128 bits), High = last 16 bytes (128 bits)
        let mut expected_reversed = test_digest;
        expected_reversed.reverse();

        let mut expected_low = [0u8; 32];
        let mut expected_high = [0u8; 32];
        expected_low[0..16].copy_from_slice(&expected_reversed[0..16]);
        expected_high[0..16].copy_from_slice(&expected_reversed[16..32]);

        assert_eq!(
            low, expected_low,
            "Low 128 bits mismatch.\nGot:      {:?}\nExpected: {:?}",
            hex::encode(low),
            hex::encode(expected_low)
        );

        assert_eq!(
            high, expected_high,
            "High 128 bits mismatch.\nGot:      {:?}\nExpected: {:?}",
            hex::encode(high),
            hex::encode(expected_high)
        );
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

        // Verify alpha_g1 matches REVERSED values (little-endian for NEAR)
        // Original big-endian: "2d4d9aa7e302d9df41749d5507949d05dbea33fbb16c643b22f599a2be6df2e2"
        // Reversed: "e2f26dbea299f5223b646cb1fb33eadb059d9407559d7441dfd902e3a79a4d2d"
        let expected_alpha_x = hex_literal::hex!(
            "e2f26dbea299f5223b646cb1fb33eadb059d9407559d7441dfd902e3a79a4d2d"
        );
        let expected_alpha_y = hex_literal::hex!(
            "26194d00ffca76f0010323190a8389ce45e39f2060ecd861b0ce373c50ddbe14"
        );

        assert_eq!(vk.alpha_g1.x, expected_alpha_x);
        assert_eq!(vk.alpha_g1.y, expected_alpha_y);
    }

    #[test]
    fn test_vk_field_elements_are_valid_bn254() {
        // CRITICAL TEST: Verifies all VK field elements are valid BN254 field elements
        // This ensures NEAR's alt_bn128 won't reject them with "invalid fq" error
        //
        // BN254 field modulus (p):
        // 21888242871839275222246405745257275088696311157297823662689037894645226208583
        // As little-endian hex:
        // 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001

        use num_bigint::BigUint;

        let bn254_modulus = BigUint::from_bytes_le(&hex_literal::hex!(
            "010000f093f5e1439170b97948e833285d588181b64550b829a031e1724e6430"
        ));

        let owner: AccountId = "owner.near".parse().unwrap();
        let context = get_context(owner.clone());
        testing_env!(context.build());

        let contract = ZkVerifier::new(owner);
        let vk = contract.get_risc_zero_universal_vk();

        // Helper to check if a byte array (interpreted as LE integer) is valid
        let is_valid_field_element = |bytes: &[u8; 32]| -> bool {
            let value = BigUint::from_bytes_le(bytes);
            value < bn254_modulus
        };

        // Check alpha_g1
        assert!(
            is_valid_field_element(&vk.alpha_g1.x),
            "alpha_g1.x is not a valid BN254 field element: {}",
            BigUint::from_bytes_le(&vk.alpha_g1.x)
        );
        assert!(
            is_valid_field_element(&vk.alpha_g1.y),
            "alpha_g1.y is not a valid BN254 field element: {}",
            BigUint::from_bytes_le(&vk.alpha_g1.y)
        );

        // Check beta_g2
        assert!(is_valid_field_element(&vk.beta_g2.x_c0), "beta_g2.x_c0 invalid");
        assert!(is_valid_field_element(&vk.beta_g2.x_c1), "beta_g2.x_c1 invalid");
        assert!(is_valid_field_element(&vk.beta_g2.y_c0), "beta_g2.y_c0 invalid");
        assert!(is_valid_field_element(&vk.beta_g2.y_c1), "beta_g2.y_c1 invalid");

        // Check gamma_g2
        assert!(is_valid_field_element(&vk.gamma_g2.x_c0), "gamma_g2.x_c0 invalid");
        assert!(is_valid_field_element(&vk.gamma_g2.x_c1), "gamma_g2.x_c1 invalid");
        assert!(is_valid_field_element(&vk.gamma_g2.y_c0), "gamma_g2.y_c0 invalid");
        assert!(is_valid_field_element(&vk.gamma_g2.y_c1), "gamma_g2.y_c1 invalid");

        // Check delta_g2
        assert!(is_valid_field_element(&vk.delta_g2.x_c0), "delta_g2.x_c0 invalid");
        assert!(is_valid_field_element(&vk.delta_g2.x_c1), "delta_g2.x_c1 invalid");
        assert!(is_valid_field_element(&vk.delta_g2.y_c0), "delta_g2.y_c0 invalid");
        assert!(is_valid_field_element(&vk.delta_g2.y_c1), "delta_g2.y_c1 invalid");

        // Check all IC points
        for (i, point) in vk.ic.iter().enumerate() {
            assert!(
                is_valid_field_element(&point.x),
                "IC[{}].x is not a valid BN254 field element: {}",
                i,
                BigUint::from_bytes_le(&point.x)
            );
            assert!(
                is_valid_field_element(&point.y),
                "IC[{}].y is not a valid BN254 field element: {}",
                i,
                BigUint::from_bytes_le(&point.y)
            );
        }

        // SUCCESS: All field elements are valid!
    }

    #[test]
    fn test_vk_byte_order_consistency() {
        // This test verifies that our VK constants are correctly reversed
        // from big-endian (RISC Zero format) to little-endian (NEAR interpretation)

        let owner: AccountId = "owner.near".parse().unwrap();
        let context = get_context(owner.clone());
        testing_env!(context.build());

        let contract = ZkVerifier::new(owner);
        let vk = contract.get_risc_zero_universal_vk();

        // Test case: IC[1].x
        // Original big-endian (from risc0_vk.json): "0x0707b920bc978c02f292fae2036e057be54294114ccc3c8769d883f688a1423f"
        // If incorrectly NOT reversed: bytes [07, 07, B9, 20, ..., 3F]
        // When interpreted as LE int: 0x3F42A188... = 28,532,873,232,... > BN254 modulus ❌ INVALID!
        //
        // Correctly reversed: bytes [3F, 42, A1, 88, ..., 07, 07]
        // When interpreted as LE int: 0x0707B920... = 3,179,835,575,... < BN254 modulus ✅ VALID!

        use num_bigint::BigUint;

        // IC[1].x should be the REVERSED version
        let ic1_x_value = BigUint::from_bytes_le(&vk.ic[1].x);

        // The reversed value should match the original big-endian hex when converted back
        // Original: 0x0707b920bc978c02f292fae2036e057be54294114ccc3c8769d883f688a1423f
        let expected_value = BigUint::parse_bytes(
            b"0707b920bc978c02f292fae2036e057be54294114ccc3c8769d883f688a1423f",
            16
        ).unwrap();

        assert_eq!(
            ic1_x_value, expected_value,
            "IC[1].x byte order is incorrect. Expected: {}, Got: {}",
            expected_value, ic1_x_value
        );

        // Additionally verify it's a valid field element
        let bn254_modulus = BigUint::from_bytes_le(&hex_literal::hex!(
            "010000f093f5e1439170b97948e833285d588181b64550b829a031e1724e6430"
        ));

        assert!(
            ic1_x_value < bn254_modulus,
            "IC[1].x value {} is >= BN254 modulus {}",
            ic1_x_value, bn254_modulus
        );
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
