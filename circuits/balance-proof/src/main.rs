//! # Balance Proof Circuit (RISC Zero Guest)
//!
//! Proves ownership of a balance amount without revealing the actual balance.
//!
//! ## Use Cases
//! - Prove you have at least X balance to withdraw
//! - Prove sufficient funds for a transaction
//! - Audit trail without revealing amounts
//!
//! ## Private Inputs
//! - balance: u64 - The actual balance
//! - blinding: [u8; 32] - Blinding factor for commitment
//! - withdrawal_amount: u64 - Amount to withdraw (optional)
//!
//! ## Public Outputs
//! - balance_commitment: [u8; 32] - Commitment to balance
//! - sufficient_funds: bool - Whether balance >= withdrawal_amount

use risc0_zkvm::guest::env;
use sha2::{Digest, Sha256};
use serde::{Deserialize, Serialize};

/// Input for balance proof
#[derive(Serialize, Deserialize)]
struct BalanceProofInput {
    /// Current balance
    balance: u64,
    /// Blinding factor for commitment
    blinding: [u8; 32],
    /// Amount to withdraw (0 if just proving balance)
    withdrawal_amount: u64,
}

fn main() {
    // Read private inputs
    let input: BalanceProofInput = env::read();

    // Compute balance commitment
    let balance_commitment = compute_commitment(input.balance, &input.blinding);

    // Check if sufficient funds for withdrawal
    let sufficient_funds = input.balance >= input.withdrawal_amount;

    // Commit public outputs
    env::commit(&balance_commitment);              // balance_commitment: 32 bytes
    env::commit(&(sufficient_funds as u8));        // sufficient_funds: 1 byte
    env::commit(&input.withdrawal_amount.to_le_bytes()); // withdrawal_amount: 8 bytes
}

/// Compute a commitment to a value
fn compute_commitment(value: u64, blinding: &[u8; 32]) -> [u8; 32] {
    let mut hasher = Sha256::new();

    // Domain separator
    hasher.update(b"near-private-payroll:balance:v1");

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
    fn test_sufficient_funds() {
        let balance = 10000u64;
        let withdrawal = 5000u64;
        assert!(balance >= withdrawal);
    }

    #[test]
    fn test_insufficient_funds() {
        let balance = 1000u64;
        let withdrawal = 5000u64;
        assert!(balance < withdrawal);
    }
}
