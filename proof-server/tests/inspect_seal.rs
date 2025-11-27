// Test to inspect Groth16 seal structure

use risc0_zkvm::{default_prover, ExecutorEnv, ProverOpts, VerifierContext};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct Input {
    threshold: u64,
}

#[test]
fn inspect_groth16_seal() {
    // Load a simple ELF
    let elf_path = std::env::var("ELF_DIR")
        .unwrap_or_else(|_| "target/riscv32im-risc0-zkvm-elf/docker".to_string())
        + "/income-proof.bin";

    let elf = std::fs::read(&elf_path).expect("Failed to read ELF");

    // Create simple input
    let input = Input { threshold: 5000 };
    let env = ExecutorEnv::builder()
        .write(&1u8).unwrap()  // proof_type
        .write(&input).unwrap()
        .build()
        .unwrap();

    // Generate Groth16 proof
    let prover = default_prover();
    let prove_info = prover
        .prove_with_ctx(
            env,
            &VerifierContext::default(),
            &elf,
            &ProverOpts::groth16(),
        )
        .expect("Proving failed");

    let receipt = prove_info.receipt;

    // Extract seal
    let seal = receipt.inner.groth16().expect("Not a Groth16 receipt");

    // Serialize and inspect
    let seal_bytes = bincode::serialize(&seal).unwrap();

    println!("Seal structure:");
    println!("  Total size: {} bytes", seal_bytes.len());
    println!("  First 100 bytes (hex): {}", hex::encode(&seal_bytes[..100.min(seal_bytes.len())]));

    // Try to understand structure
    println!("\nSeal type: {:?}", std::any::type_name_of_val(&seal));
}
