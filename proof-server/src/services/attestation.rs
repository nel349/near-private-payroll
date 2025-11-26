//! Attestation Signing Service
//!
//! Creates cryptographic attestations for generated proofs.
//! When running in TEE, attestations are bound to hardware measurements.

use crate::types::{Attestation, ProofPublicInputs, ProofType, TeeAttestation};
use ed25519_dalek::{Signer, SigningKey, VerifyingKey};
use sha2::{Digest, Sha256};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AttestationError {
    #[error("Failed to sign attestation: {0}")]
    SigningError(String),
    #[error("Invalid employee ID")]
    InvalidEmployeeId,
    #[error("TEE attestation failed: {0}")]
    TeeError(String),
}

/// Attestation signer service
pub struct AttestationSigner {
    /// Server signing key (Ed25519)
    signing_key: SigningKey,
    /// TEE attestation (cached, refreshed periodically)
    tee_attestation: Option<TeeAttestation>,
}

impl AttestationSigner {
    /// Create a new attestation signer
    pub fn new(secret_key_bytes: &[u8; 32]) -> Self {
        let signing_key = SigningKey::from_bytes(secret_key_bytes);

        Self {
            signing_key,
            tee_attestation: None,
        }
    }

    /// Create from environment (loads from ATTESTATION_SECRET_KEY)
    pub fn from_env() -> Result<Self, AttestationError> {
        let secret_hex = std::env::var("ATTESTATION_SECRET_KEY")
            .unwrap_or_else(|_| {
                // Generate random key for development
                let key: [u8; 32] = rand::random();
                hex::encode(key)
            });

        let secret_bytes: [u8; 32] = hex::decode(&secret_hex)
            .map_err(|e| AttestationError::SigningError(format!("Invalid secret key hex: {e}")))?
            .try_into()
            .map_err(|_| AttestationError::SigningError("Secret key must be 32 bytes".into()))?;

        Ok(Self::new(&secret_bytes))
    }

    /// Get the server's public key
    pub fn public_key(&self) -> [u8; 32] {
        let verifying_key: VerifyingKey = self.signing_key.verifying_key();
        verifying_key.to_bytes()
    }

    /// Set TEE attestation (called when running in TEE)
    pub fn set_tee_attestation(&mut self, attestation: TeeAttestation) {
        self.tee_attestation = Some(attestation);
    }

    /// Create an attestation for a proof
    pub fn create_attestation(
        &self,
        proof_type: ProofType,
        public_inputs: ProofPublicInputs,
        employee_id: Option<&str>,
    ) -> Result<Attestation, AttestationError> {
        let id = uuid::Uuid::new_v4().to_string();
        let timestamp = chrono::Utc::now().timestamp();

        // Hash employee ID if provided (never expose raw ID)
        let employee_id_hash = employee_id.map(|id| Self::hash_employee_id(id));

        // Compute attestation hash
        let attestation_hash = self.compute_attestation_hash(
            &id,
            proof_type,
            &public_inputs,
            employee_id_hash.as_ref(),
            timestamp,
        );

        // Sign the attestation hash
        let signature = self.signing_key.sign(&attestation_hash);

        Ok(Attestation {
            id,
            employee_id_hash,
            proof_type,
            public_inputs,
            timestamp,
            attestation_hash,
            server_pubkey: self.public_key(),
            signature: signature.to_bytes(),
            tee_attestation: self.tee_attestation.clone(),
        })
    }

    /// Hash employee ID using SHA-256
    fn hash_employee_id(employee_id: &str) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(b"near-private-payroll:employee-id:v1");
        hasher.update(employee_id.as_bytes());
        hasher.finalize().into()
    }

    /// Compute the attestation hash
    fn compute_attestation_hash(
        &self,
        id: &str,
        proof_type: ProofType,
        public_inputs: &ProofPublicInputs,
        employee_id_hash: Option<&[u8; 32]>,
        timestamp: i64,
    ) -> [u8; 32] {
        let mut hasher = Sha256::new();

        // Domain separator
        hasher.update(b"near-private-payroll:attestation:v1");

        // Attestation ID
        hasher.update(id.as_bytes());

        // Proof type
        hasher.update(&[proof_type.circuit_id()]);

        // Public inputs (serialized)
        let inputs_json = serde_json::to_vec(public_inputs).unwrap_or_default();
        hasher.update(&inputs_json);

        // Employee ID hash (if present)
        if let Some(hash) = employee_id_hash {
            hasher.update(hash);
        }

        // Timestamp
        hasher.update(&timestamp.to_le_bytes());

        // Include TEE measurement if available
        if let Some(tee) = &self.tee_attestation {
            hasher.update(&tee.code_hash);
        }

        hasher.finalize().into()
    }

    /// Verify an attestation signature
    pub fn verify_attestation(attestation: &Attestation) -> bool {
        use ed25519_dalek::{Signature, Verifier};

        let verifying_key = match VerifyingKey::from_bytes(&attestation.server_pubkey) {
            Ok(key) => key,
            Err(_) => return false,
        };

        // ed25519_dalek 2.x: from_bytes returns Signature directly (panics on invalid)
        // Use try_from for safe conversion
        let signature = Signature::from_bytes(&attestation.signature);

        verifying_key
            .verify(&attestation.attestation_hash, &signature)
            .is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_and_verify_attestation() {
        let signer = AttestationSigner::new(&[1u8; 32]);

        let public_inputs = ProofPublicInputs::IncomeThreshold {
            threshold: 50000,
            meets_threshold: true,
            payment_count: 6,
            history_commitment: [0u8; 32],
        };

        let attestation = signer
            .create_attestation(ProofType::IncomeThreshold, public_inputs, Some("alice.near"))
            .unwrap();

        assert!(AttestationSigner::verify_attestation(&attestation));
        assert!(attestation.employee_id_hash.is_some());
    }

    #[test]
    fn test_employee_id_hashing() {
        let hash1 = AttestationSigner::hash_employee_id("alice.near");
        let hash2 = AttestationSigner::hash_employee_id("alice.near");
        let hash3 = AttestationSigner::hash_employee_id("bob.near");

        assert_eq!(hash1, hash2);
        assert_ne!(hash1, hash3);
    }

    #[test]
    fn test_consistent_public_key() {
        let signer = AttestationSigner::new(&[42u8; 32]);

        let pk1 = signer.public_key();
        let pk2 = signer.public_key();

        assert_eq!(pk1, pk2);
    }
}
