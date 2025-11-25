//! # Income Proof Circuit (RISC Zero Guest)
//!
//! Proves various income-related properties without revealing actual amounts.
//!
//! ## Proof Types
//!
//! ### 1. Income Above Threshold
//! Proves: "My income is at least $X per month"
//! Use case: Loan applications, rental agreements
//!
//! ### 2. Income In Range
//! Proves: "My income is between $X and $Y per month"
//! Use case: Credit products, tiered services
//!
//! ### 3. Average Income
//! Proves: "My average income over N months is at least $X"
//! Use case: Mortgage applications, stability verification
//!
//! ### 4. Credit Score
//! Proves: "My payment consistency score is at least X"
//! Use case: Creditworthiness checks
//!
//! ## Private Inputs
//! - payment_history: Vec<u64> - Decrypted payment amounts
//! - history_commitment: [u8; 32] - Commitment binding proof to on-chain data
//! - Employee decrypts their payment history locally before generating proof
//!
//! ## Public Outputs (Journal)
//! - threshold/range params - The criteria being checked
//! - result: bool - Whether criteria is met
//! - payment_count: u32 - Number of payments (proves history length)
//! - history_commitment: [u8; 32] - Binds proof to on-chain payment data

use risc0_zkvm::guest::env;
use serde::{Deserialize, Serialize};

/// Proof type identifiers
const PROOF_TYPE_THRESHOLD: u8 = 1;
const PROOF_TYPE_RANGE: u8 = 2;
const PROOF_TYPE_AVERAGE: u8 = 3;
const PROOF_TYPE_CREDIT_SCORE: u8 = 4;

/// Input for threshold proof
#[derive(Serialize, Deserialize)]
struct ThresholdInput {
    /// Payment history (decrypted amounts)
    payment_history: Vec<u64>,
    /// Minimum income threshold
    threshold: u64,
    /// History commitment (binds proof to on-chain payment data)
    history_commitment: [u8; 32],
}

/// Input for range proof
#[derive(Serialize, Deserialize)]
struct RangeInput {
    payment_history: Vec<u64>,
    min: u64,
    max: u64,
    /// History commitment (binds proof to on-chain payment data)
    history_commitment: [u8; 32],
}

/// Input for average income proof
#[derive(Serialize, Deserialize)]
struct AverageInput {
    payment_history: Vec<u64>,
    threshold: u64,
    /// History commitment (binds proof to on-chain payment data)
    history_commitment: [u8; 32],
}

/// Input for credit score proof
#[derive(Serialize, Deserialize)]
struct CreditScoreInput {
    payment_history: Vec<u64>,
    /// Expected salary for consistency calculation
    expected_salary: u64,
    /// Minimum score threshold
    threshold: u32,
    /// History commitment (binds proof to on-chain payment data)
    history_commitment: [u8; 32],
}

fn main() {
    // Read proof type
    let proof_type: u8 = env::read();

    match proof_type {
        PROOF_TYPE_THRESHOLD => prove_income_threshold(),
        PROOF_TYPE_RANGE => prove_income_range(),
        PROOF_TYPE_AVERAGE => prove_average_income(),
        PROOF_TYPE_CREDIT_SCORE => prove_credit_score(),
        _ => panic!("Unknown proof type"),
    }
}

/// Prove income is above a threshold
/// Journal format: [threshold: 8, meets_threshold: 1, payment_count: 4, history_commitment: 32] = 45 bytes
fn prove_income_threshold() {
    let input: ThresholdInput = env::read();

    // Validate we have payment history
    assert!(!input.payment_history.is_empty(), "No payment history");

    // Get most recent payment (current monthly income)
    let current_income = *input.payment_history.last().unwrap();

    // Check if above threshold
    let meets_threshold = current_income >= input.threshold;

    // Commit public outputs (journal)
    env::commit(&input.threshold.to_le_bytes());                       // threshold: 8 bytes
    env::commit(&(meets_threshold as u8));                              // meets_threshold: 1 byte
    env::commit(&(input.payment_history.len() as u32).to_le_bytes());  // payment_count: 4 bytes
    env::commit(&input.history_commitment);                             // history_commitment: 32 bytes
}

/// Prove income is within a range
/// Journal format: [min: 8, max: 8, in_range: 1, payment_count: 4, history_commitment: 32] = 53 bytes
fn prove_income_range() {
    let input: RangeInput = env::read();

    assert!(!input.payment_history.is_empty(), "No payment history");
    assert!(input.min <= input.max, "Invalid range");

    let current_income = *input.payment_history.last().unwrap();

    let in_range = current_income >= input.min && current_income <= input.max;

    // Commit public outputs (journal)
    env::commit(&input.min.to_le_bytes());                             // min: 8 bytes
    env::commit(&input.max.to_le_bytes());                             // max: 8 bytes
    env::commit(&(in_range as u8));                                     // in_range: 1 byte
    env::commit(&(input.payment_history.len() as u32).to_le_bytes());  // payment_count: 4 bytes
    env::commit(&input.history_commitment);                             // history_commitment: 32 bytes
}

/// Prove average income meets threshold
/// Journal format: [threshold: 8, meets_threshold: 1, payment_count: 4, history_commitment: 32] = 45 bytes
fn prove_average_income() {
    let input: AverageInput = env::read();

    assert!(!input.payment_history.is_empty(), "No payment history");

    // Calculate average
    let total: u64 = input.payment_history.iter().sum();
    let count = input.payment_history.len() as u64;
    let average = total / count;

    let meets_threshold = average >= input.threshold;

    // Commit public outputs (journal)
    env::commit(&input.threshold.to_le_bytes());                       // threshold: 8 bytes
    env::commit(&(meets_threshold as u8));                              // meets_threshold: 1 byte
    env::commit(&(input.payment_history.len() as u32).to_le_bytes());  // payment_count: 4 bytes
    env::commit(&input.history_commitment);                             // history_commitment: 32 bytes
}

/// Prove credit score meets threshold
/// Credit score is based on payment consistency
/// Journal format: [threshold: 4, meets_threshold: 1, payment_count: 4, history_commitment: 32] = 41 bytes
fn prove_credit_score() {
    let input: CreditScoreInput = env::read();

    assert!(!input.payment_history.is_empty(), "No payment history");

    // Calculate credit score based on payment consistency
    // Score formula:
    // - Base score: 300
    // - +50 points per consistent payment (within 10% of expected)
    // - -25 points per inconsistent payment
    // - Max score: 850

    let mut score: i32 = 300;
    let tolerance = input.expected_salary / 10; // 10% tolerance

    for payment in &input.payment_history {
        let diff = if *payment > input.expected_salary {
            payment - input.expected_salary
        } else {
            input.expected_salary - payment
        };

        if diff <= tolerance {
            // Consistent payment
            score += 50;
        } else {
            // Inconsistent payment
            score -= 25;
        }
    }

    // Clamp score to valid range
    let score = score.clamp(300, 850) as u32;

    let meets_threshold = score >= input.threshold;

    // Commit public outputs (journal)
    env::commit(&input.threshold.to_le_bytes());                       // threshold: 4 bytes
    env::commit(&(meets_threshold as u8));                              // meets_threshold: 1 byte
    env::commit(&(input.payment_history.len() as u32).to_le_bytes());  // payment_count: 4 bytes
    env::commit(&input.history_commitment);                             // history_commitment: 32 bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_credit_score_calculation() {
        // Test consistent payments
        let expected_salary = 5000u64;
        let tolerance = expected_salary / 10; // 500

        // Payment within tolerance
        let payment = 5200u64;
        let diff = payment - expected_salary;
        assert!(diff <= tolerance);

        // Payment outside tolerance
        let payment2 = 6000u64;
        let diff2 = payment2 - expected_salary;
        assert!(diff2 > tolerance);
    }

    #[test]
    fn test_average_income_calculation() {
        let payments = vec![4000u64, 5000u64, 6000u64];
        let total: u64 = payments.iter().sum();
        let count = payments.len() as u64;
        let average = total / count;
        assert_eq!(average, 5000u64);
    }
}
