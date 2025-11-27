/**
 * Test to compute image IDs from circuit ELF binaries
 *
 * Run this test to generate image_ids.json:
 *   cargo test -p proof-server --test compute_image_ids -- --nocapture
 *
 * Or use the script:
 *   ./scripts/generate_image_ids.sh
 */

use risc0_zkvm::compute_image_id;
use std::path::PathBuf;

fn find_workspace_root() -> PathBuf {
    let mut current = std::env::current_dir().expect("Failed to get current directory");
    loop {
        let cargo_toml = current.join("Cargo.toml");
        if cargo_toml.exists() {
            // Check if this is the workspace root by looking for proof-server directory
            let proof_server_dir = current.join("proof-server");
            if proof_server_dir.exists() {
                return current;
            }
        }
        if !current.pop() {
            panic!("Could not find workspace root");
        }
    }
}

fn bytes_to_json_array(bytes: &[u8]) -> String {
    let elements: Vec<String> = bytes.iter().map(|b| b.to_string()).collect();
    format!("[{}]", elements.join(", "))
}

#[test]
fn compute_all_image_ids() {
    let workspace_root = find_workspace_root();
    let elf_dir = workspace_root.join("target/riscv32im-risc0-zkvm-elf/docker");

    println!("\nComputing image IDs from circuit ELF binaries...\n");

    // Income proof circuit
    let income_elf_path = elf_dir.join("income-proof.bin");
    assert!(income_elf_path.exists(), "income-proof.bin not found. Run: cargo risczero build --manifest-path circuits/income-proof/Cargo.toml");
    let income_elf = std::fs::read(&income_elf_path).expect("Failed to read income-proof ELF");
    let income_image_id = compute_image_id(&income_elf).expect("Failed to compute income-proof image ID");

    println!("=== income-proof ===");
    println!("Image ID (hex):   {}", hex::encode(income_image_id));
    println!("Image ID (bytes): {}", bytes_to_json_array(income_image_id.as_bytes()));
    println!();

    // Payment proof circuit
    let payment_elf_path = elf_dir.join("payment-proof.bin");
    assert!(payment_elf_path.exists(), "payment-proof.bin not found. Run: cargo risczero build --manifest-path circuits/payment-proof/Cargo.toml");
    let payment_elf = std::fs::read(&payment_elf_path).expect("Failed to read payment-proof ELF");
    let payment_image_id = compute_image_id(&payment_elf).expect("Failed to compute payment-proof image ID");

    println!("=== payment-proof ===");
    println!("Image ID (hex):   {}", hex::encode(payment_image_id));
    println!("Image ID (bytes): {}", bytes_to_json_array(payment_image_id.as_bytes()));
    println!();

    // Balance proof circuit
    let balance_elf_path = elf_dir.join("balance-proof.bin");
    assert!(balance_elf_path.exists(), "balance-proof.bin not found. Run: cargo risczero build --manifest-path circuits/balance-proof/Cargo.toml");
    let balance_elf = std::fs::read(&balance_elf_path).expect("Failed to read balance-proof ELF");
    let balance_image_id = compute_image_id(&balance_elf).expect("Failed to compute balance-proof image ID");

    println!("=== balance-proof ===");
    println!("Image ID (hex):   {}", hex::encode(balance_image_id));
    println!("Image ID (bytes): {}", bytes_to_json_array(balance_image_id.as_bytes()));
    println!();

    println!("✓ All image IDs computed successfully");
    println!();
    println!("Note: income_threshold, income_range, and credit_score all use the income-proof circuit");
}
