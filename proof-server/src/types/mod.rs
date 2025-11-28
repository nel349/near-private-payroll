//! Type definitions for the Proof Server
//!
//! This module contains all request/response types, proof types, and error codes.

use serde::{Deserialize, Serialize};

/// Helper for serializing fixed-size byte arrays larger than 32 bytes
mod bytes64 {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn serialize<S>(data: &[u8; 64], serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        hex::encode(data).serialize(serializer)
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<[u8; 64], D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        let bytes = hex::decode(&s).map_err(serde::de::Error::custom)?;
        bytes
            .try_into()
            .map_err(|_| serde::de::Error::custom("expected 64 bytes"))
    }
}

/// Proof type identifiers - matches circuit constants
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProofType {
    /// Income above threshold (rental, loan applications)
    IncomeThreshold = 1,
    /// Income within range (credit products)
    IncomeRange = 2,
    /// Average income above threshold (mortgages)
    AverageIncome = 3,
    /// Credit score above threshold
    CreditScore = 4,
    /// Payment matches salary
    Payment = 5,
    /// Balance ownership proof
    Balance = 6,
}

impl ProofType {
    pub fn circuit_id(&self) -> u8 {
        match self {
            ProofType::IncomeThreshold => 1,
            ProofType::IncomeRange => 2,
            ProofType::AverageIncome => 3,
            ProofType::CreditScore => 4,
            ProofType::Payment => 5,
            ProofType::Balance => 6,
        }
    }
}

/// Error codes returned by the API
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    /// Proof generation failed
    ProofGenerationFailed,
    /// Proof verification failed
    ProofVerificationFailed,
    /// Threshold not met
    ThresholdNotMet,
    /// Invalid input data
    InvalidInput,
    /// Invalid history commitment
    InvalidHistoryCommitment,
    /// TEE attestation failed
    AttestationFailed,
    /// Server busy (proof queue full)
    ServerBusy,
    /// Internal server error
    InternalError,
}

// ==================== Request Types ====================

/// Request to generate an income threshold proof
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncomeThresholdRequest {
    /// Payment history (decrypted amounts)
    pub payment_history: Vec<u64>,
    /// Minimum threshold to prove against
    pub threshold: u64,
    /// History commitment (binds to on-chain data)
    pub history_commitment: [u8; 32],
    /// Optional: Employee NEAR account ID
    pub employee_id: Option<String>,
}

/// Request to generate an income range proof
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncomeRangeRequest {
    /// Payment history (decrypted amounts)
    pub payment_history: Vec<u64>,
    /// Minimum of range
    pub min: u64,
    /// Maximum of range
    pub max: u64,
    /// History commitment
    pub history_commitment: [u8; 32],
    /// Optional: Employee NEAR account ID
    pub employee_id: Option<String>,
}

/// Request to generate an average income proof
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AverageIncomeRequest {
    /// Payment history (decrypted amounts)
    pub payment_history: Vec<u64>,
    /// Threshold for average
    pub threshold: u64,
    /// History commitment
    pub history_commitment: [u8; 32],
    /// Optional: Employee NEAR account ID
    pub employee_id: Option<String>,
}

/// Request to generate a credit score proof
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreditScoreRequest {
    /// Payment history (decrypted amounts)
    pub payment_history: Vec<u64>,
    /// Expected salary (for consistency calculation)
    pub expected_salary: u64,
    /// Minimum score threshold
    pub threshold: u32,
    /// History commitment
    pub history_commitment: [u8; 32],
    /// Optional: Employee NEAR account ID
    pub employee_id: Option<String>,
}

/// Request to generate a payment proof
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaymentProofRequest {
    /// The employee's salary
    pub salary: u64,
    /// Blinding factor for salary commitment
    pub salary_blinding: [u8; 32],
    /// The payment amount
    pub payment_amount: u64,
    /// Blinding factor for payment commitment
    pub payment_blinding: [u8; 32],
}

/// Generic proof generation request (wraps specific types)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "proof_type", content = "params")]
pub enum GenerateProofRequest {
    #[serde(rename = "income_threshold")]
    IncomeThreshold(IncomeThresholdRequest),
    #[serde(rename = "income_range")]
    IncomeRange(IncomeRangeRequest),
    #[serde(rename = "average_income")]
    AverageIncome(AverageIncomeRequest),
    #[serde(rename = "credit_score")]
    CreditScore(CreditScoreRequest),
    #[serde(rename = "payment")]
    Payment(PaymentProofRequest),
}

// ==================== Response Types ====================

/// Public inputs extracted from the proof
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ProofPublicInputs {
    IncomeThreshold {
        threshold: u64,
        meets_threshold: bool,
        payment_count: u32,
        history_commitment: [u8; 32],
    },
    IncomeRange {
        min: u64,
        max: u64,
        in_range: bool,
        payment_count: u32,
        history_commitment: [u8; 32],
    },
    AverageIncome {
        threshold: u64,
        meets_threshold: bool,
        payment_count: u32,
        history_commitment: [u8; 32],
    },
    CreditScore {
        threshold: u32,
        meets_threshold: bool,
        payment_count: u32,
        history_commitment: [u8; 32],
    },
    Payment {
        salary_commitment: [u8; 32],
        payment_commitment: [u8; 32],
        amounts_match: bool,
    },
}

/// TEE attestation report
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeeAttestation {
    /// Type of TEE (sgx, tdx, sev)
    pub tee_type: String,
    /// Attestation report from hardware
    pub report: Vec<u8>,
    /// Hash of the code running in enclave
    pub code_hash: [u8; 32],
    /// Timestamp of attestation
    pub timestamp: i64,
}

/// Server attestation for the proof
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attestation {
    /// Unique attestation ID
    pub id: String,
    /// Employee account ID (hashed if provided)
    pub employee_id_hash: Option<[u8; 32]>,
    /// Proof type
    pub proof_type: ProofType,
    /// Public inputs from the proof
    pub public_inputs: ProofPublicInputs,
    /// Timestamp
    pub timestamp: i64,
    /// Attestation hash (signed by server)
    pub attestation_hash: [u8; 32],
    /// Server's public key
    pub server_pubkey: [u8; 32],
    /// Signature over attestation_hash (hex encoded for serialization)
    #[serde(with = "bytes64")]
    pub signature: [u8; 64],
    /// Optional: TEE attestation (if running in TEE)
    pub tee_attestation: Option<TeeAttestation>,
}

/// Response from proof generation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateProofResponse {
    /// Unique proof request ID
    pub request_id: String,
    /// The ZK receipt (complete RISC Zero receipt: image_id + claim_digest + seal + journal)
    pub receipt: Vec<u8>,
    /// Image ID of the circuit that generated the proof
    pub image_id: [u8; 32],
    /// Proof type
    pub proof_type: ProofType,
    /// Public outputs from the proof journal
    pub public_inputs: ProofPublicInputs,
    /// Server attestation
    pub attestation: Attestation,
    /// Proof generation time in milliseconds
    pub generation_time_ms: u64,
}

/// Response from proof verification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyProofResponse {
    /// Whether the proof is valid
    pub valid: bool,
    /// The verified public inputs
    pub public_inputs: Option<ProofPublicInputs>,
    /// Error message if invalid
    pub error: Option<String>,
}

/// Error response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorResponse {
    /// Error code
    pub code: ErrorCode,
    /// Human-readable message
    pub message: String,
    /// Optional additional details
    pub details: Option<serde_json::Value>,
}

/// Server health status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    /// Server status
    pub status: String,
    /// Server version
    pub version: String,
    /// Current proof queue length
    pub queue_length: usize,
    /// Estimated wait time in seconds
    pub estimated_wait_secs: u64,
    /// Whether TEE is available
    pub tee_available: bool,
    /// TEE type if available
    pub tee_type: Option<String>,
}

/// Server status with more details
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusResponse {
    /// Server status
    pub status: String,
    /// Server version
    pub version: String,
    /// Supported proof types
    pub supported_proof_types: Vec<ProofType>,
    /// Server public key for attestations
    pub server_pubkey: [u8; 32],
    /// TEE attestation if available
    pub tee_attestation: Option<TeeAttestation>,
    /// Total proofs generated
    pub total_proofs: u64,
    /// Uptime in seconds
    pub uptime_secs: u64,
}

// ==================== Internal Types ====================

/// Internal proof job for the queue
#[derive(Debug, Clone)]
pub struct ProofJob {
    pub id: String,
    pub request: GenerateProofRequest,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Proof generation result (internal)
#[derive(Debug)]
pub enum ProofResult {
    Success {
        receipt: Vec<u8>,
        image_id: [u8; 32],
        journal: Vec<u8>,
        generation_time_ms: u64,
    },
    Failure {
        code: ErrorCode,
        message: String,
    },
}
