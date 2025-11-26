//! RISC Zero Prover Service
//!
//! Handles proof generation using RISC Zero zkVM.
//! Supports both local proving and Bonsai API.

use crate::types::{
    AverageIncomeRequest, CreditScoreRequest, ErrorCode, GenerateProofRequest,
    IncomeRangeRequest, IncomeThresholdRequest, PaymentProofRequest, ProofPublicInputs,
    ProofResult, ProofType,
};
use sha2::{Digest, Sha256};
use std::time::Instant;
use thiserror::Error;
use tracing::{error, info, instrument};

#[derive(Error, Debug)]
pub enum ProverError {
    #[error("Proof generation failed: {0}")]
    GenerationFailed(String),
    #[error("Invalid input: {0}")]
    InvalidInput(String),
    #[error("Circuit not found: {0}")]
    CircuitNotFound(String),
    #[error("Serialization error: {0}")]
    SerializationError(String),
}

/// Image IDs for each circuit (computed from circuit ELF)
/// These are placeholders - real values come from building circuits with `cargo risczero build`
pub struct ImageIds {
    pub income_threshold: [u8; 32],
    pub income_range: [u8; 32],
    pub average_income: [u8; 32],
    pub credit_score: [u8; 32],
    pub payment: [u8; 32],
    pub balance: [u8; 32],
}

impl Default for ImageIds {
    fn default() -> Self {
        // Placeholder image IDs - replace with actual after building circuits
        Self {
            income_threshold: [0x01; 32],
            income_range: [0x02; 32],
            average_income: [0x03; 32],
            credit_score: [0x04; 32],
            payment: [0x05; 32],
            balance: [0x06; 32],
        }
    }
}

/// Prover configuration
#[derive(Debug, Clone)]
pub struct ProverConfig {
    /// Use Bonsai API for proving (faster, but requires API key)
    pub use_bonsai: bool,
    /// Bonsai API key
    pub bonsai_api_key: Option<String>,
    /// Development mode - generate mock proofs
    pub dev_mode: bool,
}

impl Default for ProverConfig {
    fn default() -> Self {
        Self {
            use_bonsai: false,
            bonsai_api_key: None,
            dev_mode: cfg!(feature = "dev-mode"),
        }
    }
}

/// RISC Zero Prover Service
pub struct ProverService {
    config: ProverConfig,
    image_ids: ImageIds,
}

impl ProverService {
    /// Create a new prover service
    pub fn new(config: ProverConfig) -> Self {
        Self {
            config,
            image_ids: ImageIds::default(),
        }
    }

    /// Create from environment variables
    pub fn from_env() -> Self {
        let use_bonsai = std::env::var("USE_BONSAI").unwrap_or_default() == "true";
        let bonsai_api_key = std::env::var("BONSAI_API_KEY").ok();
        let dev_mode = std::env::var("DEV_MODE").unwrap_or_default() == "true";

        Self::new(ProverConfig {
            use_bonsai,
            bonsai_api_key,
            dev_mode,
        })
    }

    /// Get image ID for a proof type
    pub fn get_image_id(&self, proof_type: ProofType) -> [u8; 32] {
        match proof_type {
            ProofType::IncomeThreshold => self.image_ids.income_threshold,
            ProofType::IncomeRange => self.image_ids.income_range,
            ProofType::AverageIncome => self.image_ids.average_income,
            ProofType::CreditScore => self.image_ids.credit_score,
            ProofType::Payment => self.image_ids.payment,
            ProofType::Balance => self.image_ids.balance,
        }
    }

    /// Generate a proof for the given request
    #[instrument(skip(self, request))]
    pub async fn generate_proof(&self, request: GenerateProofRequest) -> ProofResult {
        let start = Instant::now();

        let result = if self.config.dev_mode {
            self.generate_mock_proof(request).await
        } else if self.config.use_bonsai {
            self.generate_bonsai_proof(request).await
        } else {
            self.generate_local_proof(request).await
        };

        let generation_time_ms = start.elapsed().as_millis() as u64;

        match result {
            Ok((proof, image_id, journal)) => {
                info!(
                    generation_time_ms,
                    proof_size = proof.len(),
                    "Proof generated successfully"
                );
                ProofResult::Success {
                    proof,
                    image_id,
                    journal,
                    generation_time_ms,
                }
            }
            Err(e) => {
                error!(error = %e, "Proof generation failed");
                ProofResult::Failure {
                    code: ErrorCode::ProofGenerationFailed,
                    message: e.to_string(),
                }
            }
        }
    }

    /// Generate proof locally using RISC Zero zkVM
    async fn generate_local_proof(
        &self,
        request: GenerateProofRequest,
    ) -> Result<(Vec<u8>, [u8; 32], Vec<u8>), ProverError> {
        // TODO: Implement actual RISC Zero proof generation
        // This requires:
        // 1. Loading the circuit ELF
        // 2. Creating executor environment with inputs
        // 3. Running the prover
        // 4. Serializing the receipt

        // For now, return error indicating real proving is not yet implemented
        Err(ProverError::GenerationFailed(
            "Local proving requires RISC Zero toolchain. Install with: curl -L https://risczero.com/install | bash && rzup install".to_string()
        ))
    }

    /// Generate proof using Bonsai API
    async fn generate_bonsai_proof(
        &self,
        request: GenerateProofRequest,
    ) -> Result<(Vec<u8>, [u8; 32], Vec<u8>), ProverError> {
        let api_key = self.config.bonsai_api_key.as_ref().ok_or_else(|| {
            ProverError::GenerationFailed("Bonsai API key not configured".to_string())
        })?;

        // TODO: Implement Bonsai API integration
        // This requires:
        // 1. Uploading circuit ELF to Bonsai
        // 2. Submitting prove request with inputs
        // 3. Polling for completion
        // 4. Downloading receipt

        Err(ProverError::GenerationFailed(
            "Bonsai integration not yet implemented".to_string(),
        ))
    }

    /// Generate mock proof for development/testing
    async fn generate_mock_proof(
        &self,
        request: GenerateProofRequest,
    ) -> Result<(Vec<u8>, [u8; 32], Vec<u8>), ProverError> {
        info!("Generating mock proof (dev mode)");

        let (proof_type, journal) = match &request {
            GenerateProofRequest::IncomeThreshold(req) => {
                let journal = self.create_income_threshold_journal(req)?;
                (ProofType::IncomeThreshold, journal)
            }
            GenerateProofRequest::IncomeRange(req) => {
                let journal = self.create_income_range_journal(req)?;
                (ProofType::IncomeRange, journal)
            }
            GenerateProofRequest::AverageIncome(req) => {
                let journal = self.create_average_income_journal(req)?;
                (ProofType::AverageIncome, journal)
            }
            GenerateProofRequest::CreditScore(req) => {
                let journal = self.create_credit_score_journal(req)?;
                (ProofType::CreditScore, journal)
            }
            GenerateProofRequest::Payment(req) => {
                let journal = self.create_payment_journal(req)?;
                (ProofType::Payment, journal)
            }
        };

        let image_id = self.get_image_id(proof_type);

        // Create mock proof structure
        // In dev mode, this is just the image_id + mock data + journal
        let mock_proof_data = vec![0u8; 256]; // Placeholder proof data
        let mut proof = Vec::new();
        proof.extend_from_slice(&image_id);
        proof.extend_from_slice(&mock_proof_data);
        proof.extend_from_slice(&journal);

        Ok((proof, image_id, journal))
    }

    /// Create journal for income threshold proof
    fn create_income_threshold_journal(
        &self,
        req: &IncomeThresholdRequest,
    ) -> Result<Vec<u8>, ProverError> {
        if req.payment_history.is_empty() {
            return Err(ProverError::InvalidInput("Empty payment history".to_string()));
        }

        let current_income = *req.payment_history.last().unwrap();
        let meets_threshold = current_income >= req.threshold;

        let mut journal = Vec::new();
        journal.extend_from_slice(&req.threshold.to_le_bytes()); // 8 bytes
        journal.push(meets_threshold as u8); // 1 byte
        journal.extend_from_slice(&(req.payment_history.len() as u32).to_le_bytes()); // 4 bytes
        journal.extend_from_slice(&req.history_commitment); // 32 bytes

        Ok(journal)
    }

    /// Create journal for income range proof
    fn create_income_range_journal(
        &self,
        req: &IncomeRangeRequest,
    ) -> Result<Vec<u8>, ProverError> {
        if req.payment_history.is_empty() {
            return Err(ProverError::InvalidInput("Empty payment history".to_string()));
        }
        if req.min > req.max {
            return Err(ProverError::InvalidInput("Invalid range: min > max".to_string()));
        }

        let current_income = *req.payment_history.last().unwrap();
        let in_range = current_income >= req.min && current_income <= req.max;

        let mut journal = Vec::new();
        journal.extend_from_slice(&req.min.to_le_bytes()); // 8 bytes
        journal.extend_from_slice(&req.max.to_le_bytes()); // 8 bytes
        journal.push(in_range as u8); // 1 byte
        journal.extend_from_slice(&(req.payment_history.len() as u32).to_le_bytes()); // 4 bytes
        journal.extend_from_slice(&req.history_commitment); // 32 bytes

        Ok(journal)
    }

    /// Create journal for average income proof
    fn create_average_income_journal(
        &self,
        req: &AverageIncomeRequest,
    ) -> Result<Vec<u8>, ProverError> {
        if req.payment_history.is_empty() {
            return Err(ProverError::InvalidInput("Empty payment history".to_string()));
        }

        let total: u64 = req.payment_history.iter().sum();
        let count = req.payment_history.len() as u64;
        let average = total / count;
        let meets_threshold = average >= req.threshold;

        let mut journal = Vec::new();
        journal.extend_from_slice(&req.threshold.to_le_bytes()); // 8 bytes
        journal.push(meets_threshold as u8); // 1 byte
        journal.extend_from_slice(&(req.payment_history.len() as u32).to_le_bytes()); // 4 bytes
        journal.extend_from_slice(&req.history_commitment); // 32 bytes

        Ok(journal)
    }

    /// Create journal for credit score proof
    fn create_credit_score_journal(
        &self,
        req: &CreditScoreRequest,
    ) -> Result<Vec<u8>, ProverError> {
        if req.payment_history.is_empty() {
            return Err(ProverError::InvalidInput("Empty payment history".to_string()));
        }

        // Calculate credit score (same logic as circuit)
        let mut score: i32 = 300;
        let tolerance = req.expected_salary / 10;

        for payment in &req.payment_history {
            let diff = if *payment > req.expected_salary {
                payment - req.expected_salary
            } else {
                req.expected_salary - payment
            };

            if diff <= tolerance {
                score += 50;
            } else {
                score -= 25;
            }
        }

        let score = score.clamp(300, 850) as u32;
        let meets_threshold = score >= req.threshold;

        let mut journal = Vec::new();
        journal.extend_from_slice(&req.threshold.to_le_bytes()); // 4 bytes
        journal.push(meets_threshold as u8); // 1 byte
        journal.extend_from_slice(&(req.payment_history.len() as u32).to_le_bytes()); // 4 bytes
        journal.extend_from_slice(&req.history_commitment); // 32 bytes

        Ok(journal)
    }

    /// Create journal for payment proof
    fn create_payment_journal(&self, req: &PaymentProofRequest) -> Result<Vec<u8>, ProverError> {
        let salary_commitment = Self::compute_commitment(req.salary, &req.salary_blinding);
        let payment_commitment =
            Self::compute_commitment(req.payment_amount, &req.payment_blinding);
        let amounts_match = req.salary == req.payment_amount;

        let mut journal = Vec::new();
        journal.extend_from_slice(&salary_commitment); // 32 bytes
        journal.extend_from_slice(&payment_commitment); // 32 bytes
        journal.push(amounts_match as u8); // 1 byte

        Ok(journal)
    }

    /// Compute Pedersen-style commitment (matches circuit)
    fn compute_commitment(value: u64, blinding: &[u8; 32]) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(b"near-private-payroll:commitment:v1");
        hasher.update(value.to_le_bytes());
        hasher.update(blinding);
        hasher.finalize().into()
    }

    /// Parse public inputs from journal bytes
    pub fn parse_public_inputs(
        proof_type: ProofType,
        journal: &[u8],
    ) -> Result<ProofPublicInputs, ProverError> {
        match proof_type {
            ProofType::IncomeThreshold | ProofType::AverageIncome => {
                if journal.len() < 45 {
                    return Err(ProverError::InvalidInput("Journal too short".to_string()));
                }
                let threshold = u64::from_le_bytes(journal[0..8].try_into().unwrap());
                let meets_threshold = journal[8] != 0;
                let payment_count = u32::from_le_bytes(journal[9..13].try_into().unwrap());
                let history_commitment: [u8; 32] = journal[13..45].try_into().unwrap();

                Ok(ProofPublicInputs::IncomeThreshold {
                    threshold,
                    meets_threshold,
                    payment_count,
                    history_commitment,
                })
            }
            ProofType::IncomeRange => {
                if journal.len() < 53 {
                    return Err(ProverError::InvalidInput("Journal too short".to_string()));
                }
                let min = u64::from_le_bytes(journal[0..8].try_into().unwrap());
                let max = u64::from_le_bytes(journal[8..16].try_into().unwrap());
                let in_range = journal[16] != 0;
                let payment_count = u32::from_le_bytes(journal[17..21].try_into().unwrap());
                let history_commitment: [u8; 32] = journal[21..53].try_into().unwrap();

                Ok(ProofPublicInputs::IncomeRange {
                    min,
                    max,
                    in_range,
                    payment_count,
                    history_commitment,
                })
            }
            ProofType::CreditScore => {
                if journal.len() < 41 {
                    return Err(ProverError::InvalidInput("Journal too short".to_string()));
                }
                let threshold = u32::from_le_bytes(journal[0..4].try_into().unwrap());
                let meets_threshold = journal[4] != 0;
                let payment_count = u32::from_le_bytes(journal[5..9].try_into().unwrap());
                let history_commitment: [u8; 32] = journal[9..41].try_into().unwrap();

                Ok(ProofPublicInputs::CreditScore {
                    threshold,
                    meets_threshold,
                    payment_count,
                    history_commitment,
                })
            }
            ProofType::Payment => {
                if journal.len() < 65 {
                    return Err(ProverError::InvalidInput("Journal too short".to_string()));
                }
                let salary_commitment: [u8; 32] = journal[0..32].try_into().unwrap();
                let payment_commitment: [u8; 32] = journal[32..64].try_into().unwrap();
                let amounts_match = journal[64] != 0;

                Ok(ProofPublicInputs::Payment {
                    salary_commitment,
                    payment_commitment,
                    amounts_match,
                })
            }
            ProofType::Balance => {
                Err(ProverError::InvalidInput("Balance proof not yet implemented".to_string()))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_income_threshold_proof() {
        let prover = ProverService::new(ProverConfig {
            dev_mode: true,
            ..Default::default()
        });

        let request = GenerateProofRequest::IncomeThreshold(IncomeThresholdRequest {
            payment_history: vec![5000, 5000, 5000, 5500, 5200, 5300],
            threshold: 5000,
            history_commitment: [0u8; 32],
            employee_id: Some("alice.near".to_string()),
        });

        let result = prover.generate_proof(request).await;

        match result {
            ProofResult::Success { journal, .. } => {
                let inputs =
                    ProverService::parse_public_inputs(ProofType::IncomeThreshold, &journal)
                        .unwrap();
                match inputs {
                    ProofPublicInputs::IncomeThreshold {
                        threshold,
                        meets_threshold,
                        payment_count,
                        ..
                    } => {
                        assert_eq!(threshold, 5000);
                        assert!(meets_threshold);
                        assert_eq!(payment_count, 6);
                    }
                    _ => panic!("Wrong public inputs type"),
                }
            }
            ProofResult::Failure { message, .. } => {
                panic!("Proof generation failed: {}", message);
            }
        }
    }

    #[tokio::test]
    async fn test_mock_credit_score_proof() {
        let prover = ProverService::new(ProverConfig {
            dev_mode: true,
            ..Default::default()
        });

        // 6 consistent payments = 300 + 6*50 = 600 score
        let request = GenerateProofRequest::CreditScore(CreditScoreRequest {
            payment_history: vec![5000, 5000, 5000, 5000, 5000, 5000],
            expected_salary: 5000,
            threshold: 600,
            history_commitment: [0u8; 32],
            employee_id: Some("alice.near".to_string()),
        });

        let result = prover.generate_proof(request).await;

        match result {
            ProofResult::Success { journal, .. } => {
                let inputs =
                    ProverService::parse_public_inputs(ProofType::CreditScore, &journal).unwrap();
                match inputs {
                    ProofPublicInputs::CreditScore {
                        threshold,
                        meets_threshold,
                        ..
                    } => {
                        assert_eq!(threshold, 600);
                        assert!(meets_threshold);
                    }
                    _ => panic!("Wrong public inputs type"),
                }
            }
            ProofResult::Failure { message, .. } => {
                panic!("Proof generation failed: {}", message);
            }
        }
    }
}
