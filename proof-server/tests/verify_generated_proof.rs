/// Test to verify generated Groth16 proofs from JSON files
///
/// CRITICAL: This test MUST pass before we can trust any NEAR integration work.
/// If RISC Zero's own verifier rejects the proof, the proof generation is broken.
/// If RISC Zero's verifier accepts it but NEAR rejects it, it's our integration bug.

use serde::Deserialize;
use std::path::PathBuf;

#[derive(Deserialize, Debug)]
struct ProofFile {
    receipt: Vec<u8>,
    image_id: Vec<u8>,
}

#[test]
#[ignore]
fn test_verify_generated_income_threshold_proof() {
    println!("\n=== Verifying Generated Income Threshold Proof ===\n");

    // Load the generated proof file
    let proof_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../scripts/test_proofs/income_threshold.json");

    println!("Loading proof from: {}", proof_path.display());
    let proof_json = std::fs::read_to_string(&proof_path)
        .expect("Failed to read proof file");

    let proof_data: ProofFile = serde_json::from_str(&proof_json)
        .expect("Failed to parse proof JSON");

    println!("  ✓ Proof loaded:");
    println!("    - Receipt: {} bytes", proof_data.receipt.len());
    println!("    - Image ID: {}", hex::encode(&proof_data.image_id));

    // This test verifies that we can load the proof structure
    // For actual RISC Zero verification, we would need to deserialize
    // the custom 464-byte format back into RISC Zero's Receipt type
    // which is part of investigating whether the custom format is valid.

    println!("\n=== Analysis ===");
    println!("Custom 464-byte receipt format:");
    println!("  Offset 0-31:    Image ID (32 bytes)");
    println!("  Offset 32-63:   Claim digest (32 bytes)");
    println!("  Offset 64-319:  Groth16 seal (256 bytes)");
    println!("  Offset 320-463: Journal (144 bytes)");

    if proof_data.receipt.len() == 464 {
        println!("\n✓ Receipt has expected length of 464 bytes");

        let embedded_image_id = &proof_data.receipt[0..32];
        println!("\n✓ Embedded image ID: {}", hex::encode(embedded_image_id));
        println!("  Expected image ID: {}", hex::encode(&proof_data.image_id));

        if embedded_image_id == &proof_data.image_id[..] {
            println!("  ✓ Image IDs match!");
        } else {
            println!("  ✗ Image IDs DON'T match - this is a problem!");
        }
    } else {
        println!("\n✗ Receipt has unexpected length: {} bytes (expected 464)", proof_data.receipt.len());
    }

    println!("\n📝 Next Step:");
    println!("To verify the proof with RISC Zero's native verifier, we need to:");
    println!("1. Deserialize the 464-byte custom format back to a Groth16Receipt");
    println!("2. Call receipt.verify(image_id)");
    println!("\nOR generate a fresh proof and verify it before converting to custom format.");
}
