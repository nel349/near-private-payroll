/**
 * Extract RISC Zero's universal Groth16 verification key and control IDs
 * Run with: cargo script extract_risc0_vk.rs
 */

use risc0_circuit_recursion::control_id::{ALLOWED_CONTROL_ROOT, BN254_IDENTITY_CONTROL_ID};
use risc0_groth16::verifying_key;

fn bytes_to_json_array(bytes: &[u8]) -> String {
    let elements: Vec<String> = bytes.iter().map(|b| b.to_string()).collect();
    format!("[{}]", elements.join(", "))
}

fn main() {
    println!("\n====================================================");
    println!("RISC Zero Universal Groth16 Verification Parameters");
    println!("====================================================\n");

    // Control IDs
    println!("=== Control IDs ===");
    println!("ALLOWED_CONTROL_ROOT (hex): {}", hex::encode(ALLOWED_CONTROL_ROOT));
    println!("ALLOWED_CONTROL_ROOT (bytes): {}", bytes_to_json_array(ALLOWED_CONTROL_ROOT.as_bytes()));
    println!();
    println!("BN254_IDENTITY_CONTROL_ID (hex): {}", hex::encode(BN254_IDENTITY_CONTROL_ID));
    println!("BN254_IDENTITY_CONTROL_ID (bytes): {}", bytes_to_json_array(BN254_IDENTITY_CONTROL_ID.as_bytes()));
    println!();

    // Verifying Key
    println!("=== Universal Verification Key ===");
    let vk = verifying_key();
    println!("{:#?}", vk);
}
