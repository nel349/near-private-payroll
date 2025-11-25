//! # ZK Verifier Contract for NEAR Protocol
//!
//! Verifies RISC Zero proofs on-chain for the private payroll system.
//!
//! ## Supported Proof Types
//! 1. **Payment Proof** - Proves payment amount matches committed salary
//! 2. **Income Threshold Proof** - Proves income >= threshold
//! 3. **Income Range Proof** - Proves min <= income <= max
//! 4. **Credit Score Proof** - Proves credit score >= threshold
//!
//! ## Architecture
//! - Stores image IDs (circuit hashes) for each proof type
//! - Verifies RISC Zero receipts (STARK proofs)
//! - Extracts and validates public outputs from journal

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
    /// Verification history
    pub verification_history: UnorderedMap<[u8; 32], VerificationRecord>,
    /// Total verifications
    pub total_verifications: u64,
    /// Successful verifications
    pub successful_verifications: u64,
}

#[near_bindgen]
impl ZkVerifier {
    /// Initialize the verifier contract
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            owner,
            image_ids: UnorderedMap::new(StorageKey::ImageIds),
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

    /// Update contract owner
    pub fn transfer_ownership(&mut self, new_owner: AccountId) {
        self.assert_owner();
        self.owner = new_owner.clone();
        env::log_str(&format!("Ownership transferred to {}", new_owner));
    }

    // ==================== VERIFICATION OPERATIONS ====================

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
        let (valid, journal) = self.verify_risc_zero_receipt(&receipt, &image_id);

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

    /// Verify an income threshold proof
    pub fn verify_income_threshold(
        &mut self,
        receipt: Vec<u8>,
        expected_threshold: u64,
    ) -> IncomeThresholdOutput {
        let submitter = env::predecessor_account_id();
        self.total_verifications += 1;

        let image_id = self.get_image_id(&ProofType::IncomeThreshold);
        let (valid, journal) = self.verify_risc_zero_receipt(&receipt, &image_id);

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
            };
        }

        let output: IncomeThresholdOutput = self.parse_income_threshold_output(&journal);

        // Verify threshold matches expected
        let valid_result = output.threshold == expected_threshold;

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

        output
    }

    /// Verify an income range proof
    pub fn verify_income_range(
        &mut self,
        receipt: Vec<u8>,
        expected_min: u64,
        expected_max: u64,
    ) -> IncomeRangeOutput {
        let submitter = env::predecessor_account_id();
        self.total_verifications += 1;

        let image_id = self.get_image_id(&ProofType::IncomeRange);
        let (valid, journal) = self.verify_risc_zero_receipt(&receipt, &image_id);

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
            };
        }

        let output: IncomeRangeOutput = self.parse_income_range_output(&journal);

        let valid_result = output.min == expected_min && output.max == expected_max;

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

        output
    }

    /// Verify a credit score proof
    pub fn verify_credit_score(
        &mut self,
        receipt: Vec<u8>,
        expected_threshold: u32,
    ) -> CreditScoreOutput {
        let submitter = env::predecessor_account_id();
        self.total_verifications += 1;

        let image_id = self.get_image_id(&ProofType::CreditScore);
        let (valid, journal) = self.verify_risc_zero_receipt(&receipt, &image_id);

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
            };
        }

        let output: CreditScoreOutput = self.parse_credit_score_output(&journal);

        let valid_result = output.threshold == expected_threshold;

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

        output
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
    fn verify_risc_zero_receipt(&self, receipt: &[u8], expected_image_id: &[u8; 32]) -> (bool, Vec<u8>) {
        // TODO: Implement actual RISC Zero verification
        // This requires the risc0-zkvm crate with verify feature
        //
        // In production:
        // 1. Deserialize receipt
        // 2. Verify STARK proof
        // 3. Check image ID matches
        // 4. Return journal bytes
        //
        // For now, we do a simplified check (development mode)

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

        // Journal is the rest of the receipt (simplified)
        let journal = receipt[32..].to_vec();

        env::log_str("Receipt verification (dev mode) - passed");
        (true, journal)
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

    fn parse_income_threshold_output(&self, journal: &[u8]) -> IncomeThresholdOutput {
        // Expected format: [threshold: 8, meets_threshold: 1, payment_count: 4]
        if journal.len() < 13 {
            return IncomeThresholdOutput {
                threshold: 0,
                meets_threshold: false,
                payment_count: 0,
            };
        }

        let threshold = u64::from_le_bytes(journal[0..8].try_into().unwrap());
        let meets_threshold = journal[8] != 0;
        let payment_count = u32::from_le_bytes(journal[9..13].try_into().unwrap());

        IncomeThresholdOutput {
            threshold,
            meets_threshold,
            payment_count,
        }
    }

    fn parse_income_range_output(&self, journal: &[u8]) -> IncomeRangeOutput {
        // Expected format: [min: 8, max: 8, in_range: 1]
        if journal.len() < 17 {
            return IncomeRangeOutput {
                min: 0,
                max: 0,
                in_range: false,
            };
        }

        let min = u64::from_le_bytes(journal[0..8].try_into().unwrap());
        let max = u64::from_le_bytes(journal[8..16].try_into().unwrap());
        let in_range = journal[16] != 0;

        IncomeRangeOutput { min, max, in_range }
    }

    fn parse_credit_score_output(&self, journal: &[u8]) -> CreditScoreOutput {
        // Expected format: [threshold: 4, meets_threshold: 1]
        if journal.len() < 5 {
            return CreditScoreOutput {
                threshold: 0,
                meets_threshold: false,
            };
        }

        let threshold = u32::from_le_bytes(journal[0..4].try_into().unwrap());
        let meets_threshold = journal[4] != 0;

        CreditScoreOutput {
            threshold,
            meets_threshold,
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
