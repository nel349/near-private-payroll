//! # Payment Proof Circuit (RISC Zero Guest)
//!
//! Proves that a payment amount matches a committed salary without revealing either.
//!
//! ## Private Inputs (Witness)
//! - salary: u64 - The actual salary amount
//! - salary_blinding: [u8; 32] - Blinding factor for salary commitment
//! - payment_amount: u64 - The payment being made
//! - payment_blinding: [u8; 32] - Blinding factor for payment commitment
//!
//! ## Public Outputs (Journal)
//! - salary_commitment: [u8; 32] - Pedersen commitment to salary
//! - payment_commitment: [u8; 32] - Pedersen commitment to payment
//! - amounts_match: bool - True if salary == payment_amount
//!
//! ## Security
//! - Actual amounts never leave the zkVM
//! - Only commitments are public
//! - Verifier learns only that amounts match (or not)

use risc0_zkvm::guest::env;
use sha2::{Digest, Sha256};
use serde::{Deserialize, Serialize};

/// Private inputs to the circuit
#[derive(Serialize, Deserialize)]
struct PaymentProofInput {
    /// The employee's salary
    salary: u64,
    /// Blinding factor for salary commitment
    salary_blinding: [u8; 32],
    /// The payment amount
    payment_amount: u64,
    /// Blinding factor for payment commitment
    payment_blinding: [u8; 32],
}

/// Public outputs from the circuit
#[derive(Serialize, Deserialize)]
struct PaymentProofOutput {
    /// Commitment to salary
    salary_commitment: [u8; 32],
    /// Commitment to payment
    payment_commitment: [u8; 32],
    /// Whether amounts match
    amounts_match: bool,
}

fn main() {
    // Read private inputs
    let input: PaymentProofInput = env::read();

    // Compute commitments (simplified Pedersen-like commitment using hash)
    // Real implementation would use proper Pedersen on elliptic curves
    let salary_commitment = compute_commitment(input.salary, &input.salary_blinding);
    let payment_commitment = compute_commitment(input.payment_amount, &input.payment_blinding);

    // Check if amounts match
    let amounts_match = input.salary == input.payment_amount;

    // Create output
    let output = PaymentProofOutput {
        salary_commitment,
        payment_commitment,
        amounts_match,
    };

    // Commit public outputs to journal
    // These are the only values visible to the verifier
    env::commit(&output.salary_commitment);
    env::commit(&output.payment_commitment);
    env::commit(&(output.amounts_match as u8));
}

/// Compute a commitment to a value
/// In production, use proper Pedersen commitment on an elliptic curve
fn compute_commitment(value: u64, blinding: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();

    // Domain separator
    hasher.update(b"near-private-payroll:commitment:v1");

    // Value (little-endian)
    hasher.update(value.to_le_bytes());

    // Blinding factor
    hasher.update(blinding);

    let result = hasher.finalize();
    let mut commitment = [0u8; 32];
    commitment.copy_from_slice(&result);
    commitment
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_commitment_deterministic() {
        let value = 5000u64;
        let blinding = [1u8; 32];

        let c1 = compute_commitment(value, &blinding);
        let c2 = compute_commitment(value, &blinding);

        assert_eq!(c1, c2);
    }

    #[test]
    fn test_different_values_different_commitments() {
        let blinding = [1u8; 32];

        let c1 = compute_commitment(5000, &blinding);
        let c2 = compute_commitment(6000, &blinding);

        assert_ne!(c1, c2);
    }

    #[test]
    fn test_different_blindings_different_commitments() {
        let value = 5000u64;

        let c1 = compute_commitment(value, &[1u8; 32]);
        let c2 = compute_commitment(value, &[2u8; 32]);

        assert_ne!(c1, c2);
    }
}
