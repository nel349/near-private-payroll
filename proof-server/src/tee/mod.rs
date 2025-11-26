//! TEE (Trusted Execution Environment) Support
//!
//! Provides hardware-based security guarantees for proof generation.
//! When running in a TEE, private inputs never leave the secure enclave.
//!
//! ## Supported Platforms
//!
//! - Intel SGX (Software Guard Extensions)
//! - Intel TDX (Trust Domain Extensions)
//! - AMD SEV (Secure Encrypted Virtualization)
//!
//! ## Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────────┐
//! │                    TEE Enclave                               │
//! │  ┌─────────────────────────────────────────────────────┐   │
//! │  │  Proof Server                                        │   │
//! │  │  ─────────────                                       │   │
//! │  │  • Receives encrypted inputs                         │   │
//! │  │  • Decrypts inside enclave                           │   │
//! │  │  • Generates ZK proof                                │   │
//! │  │  • Returns proof (private data stays in enclave)     │   │
//! │  └─────────────────────────────────────────────────────┘   │
//! │                                                              │
//! │  Attestation: Cryptographic proof that this code is         │
//! │               running in a genuine TEE, unmodified          │
//! └─────────────────────────────────────────────────────────────┘
//! ```
//!
//! ## Usage
//!
//! TEE support is enabled with the `tee` feature flag:
//! ```bash
//! cargo build --features tee
//! ```

use crate::types::TeeAttestation;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum TeeError {
    #[error("TEE not available on this platform")]
    NotAvailable,
    #[error("TEE initialization failed: {0}")]
    InitializationFailed(String),
    #[error("Attestation generation failed: {0}")]
    AttestationFailed(String),
    #[error("Attestation verification failed: {0}")]
    VerificationFailed(String),
}

/// TEE type detected at runtime
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TeeType {
    /// Intel Software Guard Extensions
    IntelSgx,
    /// Intel Trust Domain Extensions
    IntelTdx,
    /// AMD Secure Encrypted Virtualization
    AmdSev,
    /// No TEE available (software mode)
    None,
}

impl TeeType {
    pub fn as_str(&self) -> &'static str {
        match self {
            TeeType::IntelSgx => "sgx",
            TeeType::IntelTdx => "tdx",
            TeeType::AmdSev => "sev",
            TeeType::None => "none",
        }
    }
}

/// TEE Manager - handles attestation and enclave operations
pub struct TeeManager {
    tee_type: TeeType,
    /// Hash of the code running in enclave
    code_hash: [u8; 32],
}

impl TeeManager {
    /// Detect and initialize TEE support
    pub fn init() -> Result<Self, TeeError> {
        let tee_type = Self::detect_tee();

        // Compute code hash (in real TEE, this comes from hardware measurement)
        let code_hash = Self::compute_code_hash();

        Ok(Self { tee_type, code_hash })
    }

    /// Detect available TEE platform
    fn detect_tee() -> TeeType {
        // Check for TEE feature flag
        #[cfg(feature = "tee")]
        {
            // TODO: Actual TEE detection
            // - Check /dev/sgx_enclave for SGX
            // - Check /dev/tdx_guest for TDX
            // - Check /dev/sev-guest for SEV

            // For now, check environment variable
            if let Ok(tee_type) = std::env::var("TEE_TYPE") {
                return match tee_type.to_lowercase().as_str() {
                    "sgx" => TeeType::IntelSgx,
                    "tdx" => TeeType::IntelTdx,
                    "sev" => TeeType::AmdSev,
                    _ => TeeType::None,
                };
            }
        }

        TeeType::None
    }

    /// Compute hash of running code
    fn compute_code_hash() -> [u8; 32] {
        use sha2::{Digest, Sha256};

        // In real TEE, this comes from hardware measurement (MRENCLAVE for SGX)
        // For now, hash the binary path as placeholder
        let mut hasher = Sha256::new();
        hasher.update(b"near-private-payroll:proof-server:v0.1.0");

        // In production, would include actual binary hash
        if let Ok(exe_path) = std::env::current_exe() {
            hasher.update(exe_path.to_string_lossy().as_bytes());
        }

        hasher.finalize().into()
    }

    /// Get the TEE type
    pub fn tee_type(&self) -> TeeType {
        self.tee_type
    }

    /// Check if TEE is available
    pub fn is_available(&self) -> bool {
        self.tee_type != TeeType::None
    }

    /// Generate TEE attestation report
    pub fn generate_attestation(&self) -> Result<TeeAttestation, TeeError> {
        if self.tee_type == TeeType::None {
            return Err(TeeError::NotAvailable);
        }

        let report = self.generate_attestation_report()?;

        Ok(TeeAttestation {
            tee_type: self.tee_type.as_str().to_string(),
            report,
            code_hash: self.code_hash,
            timestamp: chrono::Utc::now().timestamp(),
        })
    }

    /// Generate platform-specific attestation report
    fn generate_attestation_report(&self) -> Result<Vec<u8>, TeeError> {
        match self.tee_type {
            TeeType::IntelSgx => self.generate_sgx_report(),
            TeeType::IntelTdx => self.generate_tdx_report(),
            TeeType::AmdSev => self.generate_sev_report(),
            TeeType::None => Err(TeeError::NotAvailable),
        }
    }

    /// Generate Intel SGX attestation report
    #[cfg(feature = "tee")]
    fn generate_sgx_report(&self) -> Result<Vec<u8>, TeeError> {
        // TODO: Implement SGX attestation
        // 1. Call sgx_create_report() with target info
        // 2. Get quote from quoting enclave
        // 3. Return serialized quote

        Err(TeeError::AttestationFailed(
            "SGX attestation not yet implemented".to_string(),
        ))
    }

    #[cfg(not(feature = "tee"))]
    fn generate_sgx_report(&self) -> Result<Vec<u8>, TeeError> {
        Err(TeeError::NotAvailable)
    }

    /// Generate Intel TDX attestation report
    #[cfg(feature = "tee")]
    fn generate_tdx_report(&self) -> Result<Vec<u8>, TeeError> {
        // TODO: Implement TDX attestation
        // 1. Open /dev/tdx_guest
        // 2. Request attestation report
        // 3. Return serialized report

        Err(TeeError::AttestationFailed(
            "TDX attestation not yet implemented".to_string(),
        ))
    }

    #[cfg(not(feature = "tee"))]
    fn generate_tdx_report(&self) -> Result<Vec<u8>, TeeError> {
        Err(TeeError::NotAvailable)
    }

    /// Generate AMD SEV attestation report
    #[cfg(feature = "tee")]
    fn generate_sev_report(&self) -> Result<Vec<u8>, TeeError> {
        // TODO: Implement SEV attestation
        // 1. Open /dev/sev-guest
        // 2. Request attestation report
        // 3. Return serialized report

        Err(TeeError::AttestationFailed(
            "SEV attestation not yet implemented".to_string(),
        ))
    }

    #[cfg(not(feature = "tee"))]
    fn generate_sev_report(&self) -> Result<Vec<u8>, TeeError> {
        Err(TeeError::NotAvailable)
    }

    /// Verify a TEE attestation (used by clients)
    pub fn verify_attestation(attestation: &TeeAttestation) -> Result<bool, TeeError> {
        match attestation.tee_type.as_str() {
            "sgx" => Self::verify_sgx_attestation(&attestation.report),
            "tdx" => Self::verify_tdx_attestation(&attestation.report),
            "sev" => Self::verify_sev_attestation(&attestation.report),
            _ => Err(TeeError::VerificationFailed("Unknown TEE type".to_string())),
        }
    }

    fn verify_sgx_attestation(_report: &[u8]) -> Result<bool, TeeError> {
        // TODO: Implement SGX quote verification
        // This typically involves:
        // 1. Verifying Intel's signature on the quote
        // 2. Checking the MRENCLAVE matches expected value
        // 3. Verifying TCB (Trusted Computing Base) level

        Ok(true) // Placeholder
    }

    fn verify_tdx_attestation(_report: &[u8]) -> Result<bool, TeeError> {
        // TODO: Implement TDX report verification
        Ok(true) // Placeholder
    }

    fn verify_sev_attestation(_report: &[u8]) -> Result<bool, TeeError> {
        // TODO: Implement SEV report verification
        Ok(true) // Placeholder
    }
}

/// Builder for TEE-enabled proof server
pub struct TeeProofServerBuilder {
    tee_manager: Option<TeeManager>,
    require_tee: bool,
}

impl TeeProofServerBuilder {
    pub fn new() -> Self {
        Self {
            tee_manager: None,
            require_tee: false,
        }
    }

    /// Require TEE to be available (fail if not)
    pub fn require_tee(mut self, require: bool) -> Self {
        self.require_tee = require;
        self
    }

    /// Initialize TEE support
    pub fn init_tee(mut self) -> Result<Self, TeeError> {
        let manager = TeeManager::init()?;

        if self.require_tee && !manager.is_available() {
            return Err(TeeError::NotAvailable);
        }

        self.tee_manager = Some(manager);
        Ok(self)
    }

    /// Get the TEE manager
    pub fn tee_manager(&self) -> Option<&TeeManager> {
        self.tee_manager.as_ref()
    }
}

impl Default for TeeProofServerBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tee_detection_without_feature() {
        let tee_type = TeeManager::detect_tee();
        // Without TEE feature, should be None
        assert_eq!(tee_type, TeeType::None);
    }

    #[test]
    fn test_tee_type_strings() {
        assert_eq!(TeeType::IntelSgx.as_str(), "sgx");
        assert_eq!(TeeType::IntelTdx.as_str(), "tdx");
        assert_eq!(TeeType::AmdSev.as_str(), "sev");
        assert_eq!(TeeType::None.as_str(), "none");
    }

    #[test]
    fn test_code_hash_deterministic() {
        let hash1 = TeeManager::compute_code_hash();
        let hash2 = TeeManager::compute_code_hash();
        assert_eq!(hash1, hash2);
    }
}
