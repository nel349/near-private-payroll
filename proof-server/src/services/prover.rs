//! RISC Zero Prover Service
//!
//! Handles proof generation using RISC Zero zkVM.
//! Supports both local proving and Bonsai API.

use crate::types::{
    AverageIncomeRequest, CreditScoreRequest, ErrorCode, GenerateProofRequest,
    IncomeRangeRequest, IncomeThresholdRequest, PaymentProofRequest, ProofPublicInputs,
    ProofResult, ProofType,
};
use risc0_zkvm::{default_prover, ExecutorEnv, ProverOpts, VerifierContext};
use risc0_groth16;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
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
/// Built with `cargo risczero build` in circuits/ directory
pub struct ImageIds {
    /// Income proof circuit handles all income proof types (threshold, range, average, credit score)
    pub income: [u8; 32],
    pub payment: [u8; 32],
    pub balance: [u8; 32],
}

/// Real Image IDs from built circuits
/// income-proof: 41b4f8f0b0e6b73b23b7184ee3db29ac53ef58552cef3703a08a3a558b0cf6ba
/// payment-proof: ce4e05f46415f148641544d55a7e5ab0172071adcd9b32d22ba7515bea42b4c2
/// balance-proof: 07bba158a57dac5d87de94b8935536953ef30405e4d76b0428cb923f4f798c90
impl Default for ImageIds {
    fn default() -> Self {
        Self {
            income: hex_to_bytes("41b4f8f0b0e6b73b23b7184ee3db29ac53ef58552cef3703a08a3a558b0cf6ba"),
            payment: hex_to_bytes("ce4e05f46415f148641544d55a7e5ab0172071adcd9b32d22ba7515bea42b4c2"),
            balance: hex_to_bytes("07bba158a57dac5d87de94b8935536953ef30405e4d76b0428cb923f4f798c90"),
        }
    }
}

/// Convert hex string to 32-byte array
fn hex_to_bytes(hex: &str) -> [u8; 32] {
    let bytes = hex::decode(hex).expect("Invalid hex string");
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    arr
}

// ============================================================================
// Circuit Input Structures (must match circuit expectations exactly)
// ============================================================================

/// Proof type identifiers (must match income-proof circuit constants)
const PROOF_TYPE_THRESHOLD: u8 = 1;
const PROOF_TYPE_RANGE: u8 = 2;
const PROOF_TYPE_AVERAGE: u8 = 3;
const PROOF_TYPE_CREDIT_SCORE: u8 = 4;

/// Input for threshold proof (income-proof circuit)
#[derive(Serialize, Deserialize)]
struct ThresholdInput {
    payment_history: Vec<u64>,
    threshold: u64,
    history_commitment: [u8; 32],
}

/// Input for range proof (income-proof circuit)
#[derive(Serialize, Deserialize)]
struct RangeInput {
    payment_history: Vec<u64>,
    min: u64,
    max: u64,
    history_commitment: [u8; 32],
}

/// Input for average income proof (income-proof circuit)
#[derive(Serialize, Deserialize)]
struct AverageInput {
    payment_history: Vec<u64>,
    threshold: u64,
    history_commitment: [u8; 32],
}

/// Input for credit score proof (income-proof circuit)
#[derive(Serialize, Deserialize)]
struct CreditScoreInput {
    payment_history: Vec<u64>,
    expected_salary: u64,
    threshold: u32,
    history_commitment: [u8; 32],
}

/// Input for payment proof circuit
#[derive(Serialize, Deserialize)]
struct PaymentProofInput {
    salary: u64,
    salary_blinding: [u8; 32],
    payment_amount: u64,
    payment_blinding: [u8; 32],
}

/// Input for balance proof circuit
#[derive(Serialize, Deserialize)]
struct BalanceProofInput {
    balance: u64,
    blinding: [u8; 32],
    withdrawal_amount: u64,
}

// ============================================================================
// Circuit Output Structures (must match circuit journal format exactly)
// These are what get serialized to the journal by env::commit()
// ============================================================================

/// Output for threshold proof (also used for average income)
#[derive(Serialize, Deserialize, Debug)]
struct ThresholdOutput {
    threshold: u64,
    meets_threshold: bool,
    payment_count: u32,
    history_commitment: [u8; 32],
}

/// Output for range proof
#[derive(Serialize, Deserialize, Debug)]
struct RangeOutput {
    min: u64,
    max: u64,
    in_range: bool,
    payment_count: u32,
    history_commitment: [u8; 32],
}

/// Output for credit score proof
#[derive(Serialize, Deserialize, Debug)]
struct CreditScoreOutput {
    threshold: u32,
    meets_threshold: bool,
    payment_count: u32,
    history_commitment: [u8; 32],
}

/// Output for payment proof
#[derive(Serialize, Deserialize, Debug)]
struct PaymentOutput {
    salary_commitment: [u8; 32],
    payment_commitment: [u8; 32],
    amounts_match: bool,
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
    /// Path to circuit ELF binaries directory
    pub elf_dir: PathBuf,
}

impl ProverConfig {
    /// Find the workspace root by walking up the directory tree
    fn find_workspace_root() -> Option<PathBuf> {
        let mut current = std::env::current_dir().ok()?;

        loop {
            let cargo_toml = current.join("Cargo.toml");
            if cargo_toml.exists() {
                // Check if this is the workspace root by looking for proof-server directory
                let proof_server_dir = current.join("proof-server");
                if proof_server_dir.exists() {
                    return Some(current);
                }
            }

            // Move up one directory
            if !current.pop() {
                break;
            }
        }

        None
    }

    /// Get the ELF directory path, automatically detecting workspace root
    fn find_workspace_elf_dir() -> PathBuf {
        if let Some(workspace_root) = Self::find_workspace_root() {
            workspace_root.join("target/riscv32im-risc0-zkvm-elf/docker")
        } else {
            // Fallback to relative path if workspace root not found
            PathBuf::from("target/riscv32im-risc0-zkvm-elf/docker")
        }
    }
}

impl Default for ProverConfig {
    fn default() -> Self {
        // Default ELF directory relative to project root
        let elf_dir = std::env::var("ELF_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| ProverConfig::find_workspace_elf_dir());

        Self {
            use_bonsai: false,
            bonsai_api_key: None,
            dev_mode: cfg!(feature = "dev-mode"),
            elf_dir,
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
        let elf_dir = std::env::var("ELF_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| ProverConfig::find_workspace_elf_dir());

        Self::new(ProverConfig {
            use_bonsai,
            bonsai_api_key,
            dev_mode,
            elf_dir,
        })
    }

    /// Get image ID for a proof type
    pub fn get_image_id(&self, proof_type: ProofType) -> [u8; 32] {
        match proof_type {
            // All income proof types use the same circuit (differentiated by proof_type byte input)
            ProofType::IncomeThreshold
            | ProofType::IncomeRange
            | ProofType::AverageIncome
            | ProofType::CreditScore => self.image_ids.income,
            ProofType::Payment => self.image_ids.payment,
            ProofType::Balance => self.image_ids.balance,
        }
    }

    /// Convert RISC Zero Groth16 seal to fixed 256-byte format for NEAR contract
    ///
    /// RISC Zero seal format: nested Vec structures for G1 and G2 points
    /// NEAR contract format: fixed 256 bytes = A (64) || B (128) || C (64)
    ///
    /// G1 point: x (32 bytes) || y (32 bytes) = 64 bytes
    /// G2 point: x_c0 (32) || x_c1 (32) || y_c0 (32) || y_c1 (32) = 128 bytes
    fn convert_seal_to_fixed_format(seal: &risc0_groth16::Seal) -> Result<Vec<u8>, ProverError> {
        let mut result = Vec::with_capacity(256);

        // Helper to convert Vec<u8> to fixed array and extend result
        let mut extend_bytes = |vec: &Vec<u8>, expected_len: usize| -> Result<(), ProverError> {
            if vec.len() != expected_len {
                return Err(ProverError::SerializationError(format!(
                    "Expected {} bytes, got {}",
                    expected_len,
                    vec.len()
                )));
            }
            result.extend_from_slice(vec);
            Ok(())
        };

        // Point A (G1): [x, y]
        if seal.a.len() != 2 {
            return Err(ProverError::SerializationError(format!(
                "Invalid G1 point A: expected 2 coordinates, got {}",
                seal.a.len()
            )));
        }
        extend_bytes(&seal.a[0], 32)?; // A.x
        extend_bytes(&seal.a[1], 32)?; // A.y

        // Point B (G2): [[x_c0, x_c1], [y_c0, y_c1]]
        if seal.b.len() != 2 {
            return Err(ProverError::SerializationError(format!(
                "Invalid G2 point B: expected 2 Fp2 elements, got {}",
                seal.b.len()
            )));
        }
        if seal.b[0].len() != 2 || seal.b[1].len() != 2 {
            return Err(ProverError::SerializationError(
                "Invalid G2 point B: Fp2 elements must have 2 components each".to_string(),
            ));
        }
        extend_bytes(&seal.b[0][0], 32)?; // B.x_c0
        extend_bytes(&seal.b[0][1], 32)?; // B.x_c1
        extend_bytes(&seal.b[1][0], 32)?; // B.y_c0
        extend_bytes(&seal.b[1][1], 32)?; // B.y_c1

        // Point C (G1): [x, y]
        if seal.c.len() != 2 {
            return Err(ProverError::SerializationError(format!(
                "Invalid G1 point C: expected 2 coordinates, got {}",
                seal.c.len()
            )));
        }
        extend_bytes(&seal.c[0], 32)?; // C.x
        extend_bytes(&seal.c[1], 32)?; // C.y

        // Verify total length
        if result.len() != 256 {
            return Err(ProverError::SerializationError(format!(
                "Invalid seal size: expected 256 bytes, got {}",
                result.len()
            )));
        }

        Ok(result)
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
        info!("Generating real STARK proof locally");

        // Determine which circuit to use and prepare inputs
        let (elf_name, proof_type, env) = match &request {
            GenerateProofRequest::IncomeThreshold(req) => {
                let input = ThresholdInput {
                    payment_history: req.payment_history.clone(),
                    threshold: req.threshold,
                    history_commitment: req.history_commitment,
                };
                let env = ExecutorEnv::builder()
                    .write(&PROOF_TYPE_THRESHOLD)
                    .map_err(|e| ProverError::SerializationError(e.to_string()))?
                    .write(&input)
                    .map_err(|e| ProverError::SerializationError(e.to_string()))?
                    .build()
                    .map_err(|e| ProverError::GenerationFailed(e.to_string()))?;
                ("income-proof.bin", ProofType::IncomeThreshold, env)
            }
            GenerateProofRequest::IncomeRange(req) => {
                let input = RangeInput {
                    payment_history: req.payment_history.clone(),
                    min: req.min,
                    max: req.max,
                    history_commitment: req.history_commitment,
                };
                let env = ExecutorEnv::builder()
                    .write(&PROOF_TYPE_RANGE)
                    .map_err(|e| ProverError::SerializationError(e.to_string()))?
                    .write(&input)
                    .map_err(|e| ProverError::SerializationError(e.to_string()))?
                    .build()
                    .map_err(|e| ProverError::GenerationFailed(e.to_string()))?;
                ("income-proof.bin", ProofType::IncomeRange, env)
            }
            GenerateProofRequest::AverageIncome(req) => {
                let input = AverageInput {
                    payment_history: req.payment_history.clone(),
                    threshold: req.threshold,
                    history_commitment: req.history_commitment,
                };
                let env = ExecutorEnv::builder()
                    .write(&PROOF_TYPE_AVERAGE)
                    .map_err(|e| ProverError::SerializationError(e.to_string()))?
                    .write(&input)
                    .map_err(|e| ProverError::SerializationError(e.to_string()))?
                    .build()
                    .map_err(|e| ProverError::GenerationFailed(e.to_string()))?;
                ("income-proof.bin", ProofType::AverageIncome, env)
            }
            GenerateProofRequest::CreditScore(req) => {
                let input = CreditScoreInput {
                    payment_history: req.payment_history.clone(),
                    expected_salary: req.expected_salary,
                    threshold: req.threshold,
                    history_commitment: req.history_commitment,
                };
                let env = ExecutorEnv::builder()
                    .write(&PROOF_TYPE_CREDIT_SCORE)
                    .map_err(|e| ProverError::SerializationError(e.to_string()))?
                    .write(&input)
                    .map_err(|e| ProverError::SerializationError(e.to_string()))?
                    .build()
                    .map_err(|e| ProverError::GenerationFailed(e.to_string()))?;
                ("income-proof.bin", ProofType::CreditScore, env)
            }
            GenerateProofRequest::Payment(req) => {
                let input = PaymentProofInput {
                    salary: req.salary,
                    salary_blinding: req.salary_blinding,
                    payment_amount: req.payment_amount,
                    payment_blinding: req.payment_blinding,
                };
                let env = ExecutorEnv::builder()
                    .write(&input)
                    .map_err(|e| ProverError::SerializationError(e.to_string()))?
                    .build()
                    .map_err(|e| ProverError::GenerationFailed(e.to_string()))?;
                ("payment-proof.bin", ProofType::Payment, env)
            }
        };

        // Load the circuit ELF
        let elf_path = self.config.elf_dir.join(elf_name);
        info!(?elf_path, "Loading circuit ELF");

        let elf = std::fs::read(&elf_path).map_err(|e| {
            ProverError::CircuitNotFound(format!("Failed to read ELF at {:?}: {}", elf_path, e))
        })?;

        // Get the prover and generate proof
        let prover = default_prover();
        info!("Starting STARK proof generation...");

        // Generate succinct STARK proof first
        let prove_info = prover
            .prove_with_ctx(
                env,
                &VerifierContext::default(),
                &elf,
                &ProverOpts::succinct(),
            )
            .map_err(|e| ProverError::GenerationFailed(format!("Prover error: {}", e)))?;

        let receipt = prove_info.receipt;
        info!(
            "STARK proof generated successfully, journal size: {} bytes",
            receipt.journal.bytes.len()
        );

        // Get image ID from receipt
        let image_id = self.get_image_id(proof_type);

        // Extract the succinct receipt
        let succinct_receipt = receipt.inner.succinct().map_err(|e| {
            ProverError::GenerationFailed(format!("Receipt is not succinct format: {}", e))
        })?;

        // Convert to identity_p254 format (required for Groth16)
        info!("Converting to identity_p254 format...");
        let identity_receipt = risc0_zkvm::recursion::identity_p254(succinct_receipt)
            .map_err(|e| ProverError::GenerationFailed(format!("identity_p254 conversion failed: {}", e)))?;

        // Get seal bytes in the correct format
        info!("Converting STARK proof to Groth16 via shrink_wrap (this takes ~2 minutes)...");
        let seal_bytes = identity_receipt.get_seal_bytes();

        // Call shrink_wrap to convert to Groth16
        let groth16_seal = risc0_groth16::prove::shrink_wrap(&seal_bytes)
            .map_err(|e| ProverError::GenerationFailed(format!("Groth16 conversion failed: {}", e)))?;

        // Convert Groth16 seal to fixed 256-byte format
        let seal_bytes = Self::convert_seal_to_fixed_format(&groth16_seal)?;

        info!(
            "Groth16 proof generated: {} bytes (image_id: {}, seal: {}, journal: {})",
            image_id.len() + seal_bytes.len() + receipt.journal.bytes.len(),
            image_id.len(),
            seal_bytes.len(),
            receipt.journal.bytes.len()
        );

        // Package: image_id (32) + seal (256 bytes fixed) + journal (public outputs)
        let mut proof_bytes = Vec::new();
        proof_bytes.extend_from_slice(&image_id);
        proof_bytes.extend_from_slice(&seal_bytes);
        proof_bytes.extend_from_slice(&receipt.journal.bytes);

        Ok((proof_bytes, image_id, receipt.journal.bytes.clone()))
    }

    /// Generate proof using Bonsai API
    async fn generate_bonsai_proof(
        &self,
        _request: GenerateProofRequest,
    ) -> Result<(Vec<u8>, [u8; 32], Vec<u8>), ProverError> {
        let _api_key = self.config.bonsai_api_key.as_ref().ok_or_else(|| {
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

    /// Create journal for income threshold proof using RISC Zero's fixed-size LE format
    /// Format: threshold(u64/8) + meets_threshold(u32/4) + payment_count(u32/4) + history_commitment(32) = 48 bytes
    fn create_income_threshold_journal(
        &self,
        req: &IncomeThresholdRequest,
    ) -> Result<Vec<u8>, ProverError> {
        if req.payment_history.is_empty() {
            return Err(ProverError::InvalidInput("Empty payment history".to_string()));
        }

        let current_income = *req.payment_history.last().unwrap();
        let meets_threshold = current_income >= req.threshold;

        let mut journal = Vec::with_capacity(48);
        journal.extend_from_slice(&req.threshold.to_le_bytes());
        journal.extend_from_slice(&(meets_threshold as u32).to_le_bytes());
        journal.extend_from_slice(&(req.payment_history.len() as u32).to_le_bytes());
        journal.extend_from_slice(&req.history_commitment);
        Ok(journal)
    }

    /// Create journal for income range proof using RISC Zero's fixed-size LE format
    /// Format: min(u64/8) + max(u64/8) + in_range(u32/4) + payment_count(u32/4) + history_commitment(32) = 56 bytes
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

        let mut journal = Vec::with_capacity(56);
        journal.extend_from_slice(&req.min.to_le_bytes());
        journal.extend_from_slice(&req.max.to_le_bytes());
        journal.extend_from_slice(&(in_range as u32).to_le_bytes());
        journal.extend_from_slice(&(req.payment_history.len() as u32).to_le_bytes());
        journal.extend_from_slice(&req.history_commitment);
        Ok(journal)
    }

    /// Create journal for average income proof using RISC Zero's fixed-size LE format
    /// Format: threshold(u64/8) + meets_threshold(u32/4) + payment_count(u32/4) + history_commitment(32) = 48 bytes
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

        let mut journal = Vec::with_capacity(48);
        journal.extend_from_slice(&req.threshold.to_le_bytes());
        journal.extend_from_slice(&(meets_threshold as u32).to_le_bytes());
        journal.extend_from_slice(&(req.payment_history.len() as u32).to_le_bytes());
        journal.extend_from_slice(&req.history_commitment);
        Ok(journal)
    }

    /// Create journal for credit score proof using RISC Zero's fixed-size LE format
    /// Format: threshold(u32/4) + meets_threshold(u32/4) + payment_count(u32/4) + history_commitment(32) = 44 bytes
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

        let mut journal = Vec::with_capacity(44);
        journal.extend_from_slice(&req.threshold.to_le_bytes());
        journal.extend_from_slice(&(meets_threshold as u32).to_le_bytes());
        journal.extend_from_slice(&(req.payment_history.len() as u32).to_le_bytes());
        journal.extend_from_slice(&req.history_commitment);
        Ok(journal)
    }

    /// Create journal for payment proof using RISC Zero's fixed-size LE format
    /// Format: salary_commitment(32) + payment_commitment(32) + amounts_match(u32/4) = 68 bytes
    fn create_payment_journal(&self, req: &PaymentProofRequest) -> Result<Vec<u8>, ProverError> {
        let salary_commitment = Self::compute_commitment(req.salary, &req.salary_blinding);
        let payment_commitment =
            Self::compute_commitment(req.payment_amount, &req.payment_blinding);
        let amounts_match = req.salary == req.payment_amount;

        let mut journal = Vec::with_capacity(68);
        journal.extend_from_slice(&salary_commitment);
        journal.extend_from_slice(&payment_commitment);
        journal.extend_from_slice(&(amounts_match as u32).to_le_bytes());
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
    /// RISC Zero uses fixed-size little-endian encoding, NOT postcard varint!
    /// - u64: 8 bytes LE
    /// - bool: 4 bytes LE (treated as u32)
    /// - u32: 4 bytes LE
    /// - [u8; N]: N bytes raw
    pub fn parse_public_inputs(
        proof_type: ProofType,
        journal: &[u8],
    ) -> Result<ProofPublicInputs, ProverError> {
        match proof_type {
            ProofType::IncomeThreshold | ProofType::AverageIncome => {
                // ThresholdOutput: threshold(u64) + meets_threshold(bool/u32) + payment_count(u32) + history_commitment([u8;32])
                // Total: 8 + 4 + 4 + 32 = 48 bytes
                if journal.len() < 48 {
                    return Err(ProverError::SerializationError(format!(
                        "Journal too short for ThresholdOutput: {} bytes, expected 48",
                        journal.len()
                    )));
                }

                let threshold = u64::from_le_bytes(journal[0..8].try_into().unwrap());
                let meets_threshold = u32::from_le_bytes(journal[8..12].try_into().unwrap()) != 0;
                let payment_count = u32::from_le_bytes(journal[12..16].try_into().unwrap());
                let mut history_commitment = [0u8; 32];
                history_commitment.copy_from_slice(&journal[16..48]);

                Ok(ProofPublicInputs::IncomeThreshold {
                    threshold,
                    meets_threshold,
                    payment_count,
                    history_commitment,
                })
            }
            ProofType::IncomeRange => {
                // RangeOutput: min(u64) + max(u64) + in_range(bool/u32) + payment_count(u32) + history_commitment([u8;32])
                // Total: 8 + 8 + 4 + 4 + 32 = 56 bytes
                if journal.len() < 56 {
                    return Err(ProverError::SerializationError(format!(
                        "Journal too short for RangeOutput: {} bytes, expected 56",
                        journal.len()
                    )));
                }

                let min = u64::from_le_bytes(journal[0..8].try_into().unwrap());
                let max = u64::from_le_bytes(journal[8..16].try_into().unwrap());
                let in_range = u32::from_le_bytes(journal[16..20].try_into().unwrap()) != 0;
                let payment_count = u32::from_le_bytes(journal[20..24].try_into().unwrap());
                let mut history_commitment = [0u8; 32];
                history_commitment.copy_from_slice(&journal[24..56]);

                Ok(ProofPublicInputs::IncomeRange {
                    min,
                    max,
                    in_range,
                    payment_count,
                    history_commitment,
                })
            }
            ProofType::CreditScore => {
                // CreditScoreOutput: threshold(u32) + meets_threshold(bool/u32) + payment_count(u32) + history_commitment([u8;32])
                // Total: 4 + 4 + 4 + 32 = 44 bytes
                if journal.len() < 44 {
                    return Err(ProverError::SerializationError(format!(
                        "Journal too short for CreditScoreOutput: {} bytes, expected 44",
                        journal.len()
                    )));
                }

                let threshold = u32::from_le_bytes(journal[0..4].try_into().unwrap());
                let meets_threshold = u32::from_le_bytes(journal[4..8].try_into().unwrap()) != 0;
                let payment_count = u32::from_le_bytes(journal[8..12].try_into().unwrap());
                let mut history_commitment = [0u8; 32];
                history_commitment.copy_from_slice(&journal[12..44]);

                Ok(ProofPublicInputs::CreditScore {
                    threshold,
                    meets_threshold,
                    payment_count,
                    history_commitment,
                })
            }
            ProofType::Payment => {
                // PaymentOutput: salary_commitment([u8;32]) + payment_commitment([u8;32]) + amounts_match(bool/u32)
                // Total: 32 + 32 + 4 = 68 bytes
                if journal.len() < 68 {
                    return Err(ProverError::SerializationError(format!(
                        "Journal too short for PaymentOutput: {} bytes, expected 68",
                        journal.len()
                    )));
                }

                let mut salary_commitment = [0u8; 32];
                salary_commitment.copy_from_slice(&journal[0..32]);
                let mut payment_commitment = [0u8; 32];
                payment_commitment.copy_from_slice(&journal[32..64]);
                let amounts_match = u32::from_le_bytes(journal[64..68].try_into().unwrap()) != 0;

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
