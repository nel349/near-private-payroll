/// Generate Test Proofs for Fast Verification Testing
///
/// This test generates real Groth16 proofs and saves them to JSON files
/// for use in fast Rust integration tests.
///
/// Run with: cargo test -p proof-server --test generate_test_proof -- --nocapture --ignored
///
/// The generated proofs are saved to:
/// - scripts/test_proofs/income_threshold.json
/// - scripts/test_proofs/income_range.json
/// - scripts/test_proofs/credit_score.json
///
/// These can be loaded by zk-verifier integration tests for fast verification testing
/// without needing to regenerate proofs every time.

use proof_server::prover::{IncomeProofInputs, ProofType};
use proof_server::utils::compute_history_commitment;
use risc0_zkvm::{default_prover, ExecutorEnv};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Serialize, Deserialize)]
struct TestProofData {
    /// Full RISC Zero receipt (image_id + claim_digest + seal + journal)
    receipt: Vec<u8>,
    /// Image ID (32 bytes)
    image_id: Vec<u8>,
    /// Public inputs (decoded from journal)
    public_inputs: serde_json::Value,
    /// Input parameters used to generate this proof
    params: serde_json::Value,
}

#[test]
#[ignore] // Run explicitly with --ignored flag (takes ~2 minutes per proof)
fn generate_income_threshold_test_proof() {
    println!("\n=== Generating Income Threshold Test Proof ===");
    println!("This will take ~2 minutes...\n");

    // Load income-proof ELF
    let elf_path = get_elf_path("income-proof");
    let elf = fs::read(&elf_path).expect("Failed to read income-proof ELF");

    // Input parameters
    let payment_history = vec![5000u64, 5200, 5100];
    let threshold = 4000u64;

    // Compute history commitment (matches contract logic)
    let payment_commitments: Vec<[u8; 32]> = payment_history
        .iter()
        .enumerate()
        .map(|(i, &amount)| {
            let mut commitment = [0u8; 32];
            for j in 0..32 {
                commitment[j] = ((amount as usize + i + j) % 256) as u8;
            }
            commitment
        })
        .collect();
    let history_commitment = compute_history_commitment(&payment_commitments);

    // Prepare inputs
    let inputs = IncomeProofInputs::Threshold {
        payment_history: payment_history.clone(),
        threshold,
        history_commitment,
    };

    println!("Input parameters:");
    println!("  Payment history: {:?}", payment_history);
    println!("  Threshold: {}", threshold);
    println!("  History commitment: {}", hex::encode(&history_commitment));

    // Build executor environment
    let env = ExecutorEnv::builder()
        .write(&inputs)
        .expect("Failed to write inputs")
        .build()
        .expect("Failed to build environment");

    // Generate proof
    println!("\nGenerating proof...");
    let prover = default_prover();
    let prove_info = prover
        .prove(env, &elf)
        .expect("Failed to generate proof");

    println!("✓ Proof generated");

    // Extract receipt
    let receipt = prove_info.receipt;

    // Decode journal to get public inputs
    let journal_bytes = receipt.journal.bytes.clone();

    // Parse journal based on IncomeThresholdOutputs structure
    // Format: history_commitment(32) + meets_threshold(1) + payment_count(4) + threshold(8)
    assert!(journal_bytes.len() >= 45, "Journal too short");

    let meets_threshold = journal_bytes[32] != 0;
    let payment_count = u32::from_le_bytes([
        journal_bytes[33],
        journal_bytes[34],
        journal_bytes[35],
        journal_bytes[36],
    ]);
    let threshold_out = u64::from_le_bytes([
        journal_bytes[37],
        journal_bytes[38],
        journal_bytes[39],
        journal_bytes[40],
        journal_bytes[41],
        journal_bytes[42],
        journal_bytes[43],
        journal_bytes[44],
    ]);

    println!("\nPublic outputs:");
    println!("  Meets threshold: {}", meets_threshold);
    println!("  Payment count: {}", payment_count);
    println!("  Threshold: {}", threshold_out);

    // Convert to Groth16
    println!("\nConverting to Groth16...");
    let (groth16_receipt, image_id) = proof_server::groth16::convert_to_groth16(receipt)
        .expect("Failed to convert to Groth16");

    println!("✓ Converted to Groth16");
    println!("  Receipt size: {} bytes", groth16_receipt.len());
    println!("  Image ID: {}", hex::encode(&image_id));

    // Save to JSON
    let test_proof = TestProofData {
        receipt: groth16_receipt,
        image_id: image_id.to_vec(),
        public_inputs: serde_json::json!({
            "history_commitment": history_commitment.to_vec(),
            "meets_threshold": meets_threshold,
            "payment_count": payment_count,
            "threshold": threshold_out,
        }),
        params: serde_json::json!({
            "payment_history": payment_history,
            "threshold": threshold,
            "history_commitment": history_commitment.to_vec(),
        }),
    };

    save_test_proof("income_threshold", &test_proof);

    println!("\n✓ Test proof saved to scripts/test_proofs/income_threshold.json");
    println!("\nYou can now run fast verification tests with:");
    println!("  cargo test -p zk-verifier --test integration_test test_real_proof_verification");
}

#[test]
#[ignore]
fn generate_income_range_test_proof() {
    println!("\n=== Generating Income Range Test Proof ===");
    println!("This will take ~2 minutes...\n");

    let elf_path = get_elf_path("income-proof");
    let elf = fs::read(&elf_path).expect("Failed to read income-proof ELF");

    let payment_history = vec![4000u64, 5000, 6000];
    let min = 3000u64;
    let max = 7000u64;

    let payment_commitments: Vec<[u8; 32]> = payment_history
        .iter()
        .enumerate()
        .map(|(i, &amount)| {
            let mut commitment = [0u8; 32];
            for j in 0..32 {
                commitment[j] = ((amount as usize + i + j) % 256) as u8;
            }
            commitment
        })
        .collect();
    let history_commitment = compute_history_commitment(&payment_commitments);

    let inputs = IncomeProofInputs::Range {
        payment_history: payment_history.clone(),
        min,
        max,
        history_commitment,
    };

    println!("Input parameters:");
    println!("  Payment history: {:?}", payment_history);
    println!("  Range: [{}, {}]", min, max);

    let env = ExecutorEnv::builder()
        .write(&inputs)
        .expect("Failed to write inputs")
        .build()
        .expect("Failed to build environment");

    println!("\nGenerating proof...");
    let prover = default_prover();
    let prove_info = prover
        .prove(env, &elf)
        .expect("Failed to generate proof");

    println!("✓ Proof generated");

    let receipt = prove_info.receipt;
    let journal_bytes = receipt.journal.bytes.clone();

    // Parse journal: history_commitment(32) + in_range(1) + payment_count(4) + min(8) + max(8)
    let in_range = journal_bytes[32] != 0;
    let payment_count = u32::from_le_bytes([
        journal_bytes[33],
        journal_bytes[34],
        journal_bytes[35],
        journal_bytes[36],
    ]);
    let min_out = u64::from_le_bytes([
        journal_bytes[37], journal_bytes[38], journal_bytes[39], journal_bytes[40],
        journal_bytes[41], journal_bytes[42], journal_bytes[43], journal_bytes[44],
    ]);
    let max_out = u64::from_le_bytes([
        journal_bytes[45], journal_bytes[46], journal_bytes[47], journal_bytes[48],
        journal_bytes[49], journal_bytes[50], journal_bytes[51], journal_bytes[52],
    ]);

    println!("\nPublic outputs:");
    println!("  In range: {}", in_range);
    println!("  Payment count: {}", payment_count);
    println!("  Range: [{}, {}]", min_out, max_out);

    println!("\nConverting to Groth16...");
    let (groth16_receipt, image_id) = proof_server::groth16::convert_to_groth16(receipt)
        .expect("Failed to convert to Groth16");

    println!("✓ Converted to Groth16");

    let test_proof = TestProofData {
        receipt: groth16_receipt,
        image_id: image_id.to_vec(),
        public_inputs: serde_json::json!({
            "history_commitment": history_commitment.to_vec(),
            "in_range": in_range,
            "payment_count": payment_count,
            "min": min_out,
            "max": max_out,
        }),
        params: serde_json::json!({
            "payment_history": payment_history,
            "min": min,
            "max": max,
            "history_commitment": history_commitment.to_vec(),
        }),
    };

    save_test_proof("income_range", &test_proof);
    println!("\n✓ Test proof saved to scripts/test_proofs/income_range.json");
}

#[test]
#[ignore]
fn generate_credit_score_test_proof() {
    println!("\n=== Generating Credit Score Test Proof ===");
    println!("This will take ~2 minutes...\n");

    let elf_path = get_elf_path("income-proof");
    let elf = fs::read(&elf_path).expect("Failed to read income-proof ELF");

    let payment_history = vec![5000u64, 5100, 5050, 4950, 5200, 4900];
    let expected_salary = 5000u64;
    let threshold = 500u64;

    let payment_commitments: Vec<[u8; 32]> = payment_history
        .iter()
        .enumerate()
        .map(|(i, &amount)| {
            let mut commitment = [0u8; 32];
            for j in 0..32 {
                commitment[j] = ((amount as usize + i + j) % 256) as u8;
            }
            commitment
        })
        .collect();
    let history_commitment = compute_history_commitment(&payment_commitments);

    let inputs = IncomeProofInputs::CreditScore {
        payment_history: payment_history.clone(),
        expected_salary,
        threshold,
        history_commitment,
    };

    println!("Input parameters:");
    println!("  Payment history: {:?}", payment_history);
    println!("  Expected salary: {}", expected_salary);
    println!("  Threshold: {}", threshold);

    let env = ExecutorEnv::builder()
        .write(&inputs)
        .expect("Failed to write inputs")
        .build()
        .expect("Failed to build environment");

    println!("\nGenerating proof...");
    let prover = default_prover();
    let prove_info = prover
        .prove(env, &elf)
        .expect("Failed to generate proof");

    println!("✓ Proof generated");

    let receipt = prove_info.receipt;
    let journal_bytes = receipt.journal.bytes.clone();

    // Parse journal: history_commitment(32) + meets_threshold(1) + payment_count(4) + threshold(8)
    let meets_threshold = journal_bytes[32] != 0;
    let payment_count = u32::from_le_bytes([
        journal_bytes[33], journal_bytes[34], journal_bytes[35], journal_bytes[36],
    ]);
    let threshold_out = u64::from_le_bytes([
        journal_bytes[37], journal_bytes[38], journal_bytes[39], journal_bytes[40],
        journal_bytes[41], journal_bytes[42], journal_bytes[43], journal_bytes[44],
    ]);

    println!("\nPublic outputs:");
    println!("  Meets threshold: {}", meets_threshold);
    println!("  Payment count: {}", payment_count);
    println!("  Threshold: {}", threshold_out);

    println!("\nConverting to Groth16...");
    let (groth16_receipt, image_id) = proof_server::groth16::convert_to_groth16(receipt)
        .expect("Failed to convert to Groth16");

    println!("✓ Converted to Groth16");

    let test_proof = TestProofData {
        receipt: groth16_receipt,
        image_id: image_id.to_vec(),
        public_inputs: serde_json::json!({
            "history_commitment": history_commitment.to_vec(),
            "meets_threshold": meets_threshold,
            "payment_count": payment_count,
            "threshold": threshold_out,
        }),
        params: serde_json::json!({
            "payment_history": payment_history,
            "expected_salary": expected_salary,
            "threshold": threshold,
            "history_commitment": history_commitment.to_vec(),
        }),
    };

    save_test_proof("credit_score", &test_proof);
    println!("\n✓ Test proof saved to scripts/test_proofs/credit_score.json");
}

// Helper functions

fn get_elf_path(circuit_name: &str) -> PathBuf {
    let elf_dir = std::env::var("ELF_DIR").unwrap_or_else(|_| {
        let workspace_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf();
        workspace_root.join("target/riscv32im-risc0-zkvm-elf/docker").to_str().unwrap().to_string()
    });

    PathBuf::from(elf_dir).join(circuit_name)
}

fn save_test_proof(name: &str, data: &TestProofData) {
    let workspace_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf();

    let output_dir = workspace_root.join("scripts/test_proofs");
    fs::create_dir_all(&output_dir).expect("Failed to create output directory");

    let output_path = output_dir.join(format!("{}.json", name));
    let json = serde_json::to_string_pretty(data).expect("Failed to serialize proof data");

    fs::write(&output_path, json).expect("Failed to write proof file");

    println!("Saved test proof to: {}", output_path.display());
}
