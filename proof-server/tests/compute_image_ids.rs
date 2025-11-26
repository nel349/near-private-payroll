// Utility to compute image IDs for all circuits
// Run with: cargo test -p proof-server --test compute_image_ids -- --nocapture

use risc0_zkvm::compute_image_id;

#[test]
fn compute_all_image_ids() {
    println!("\n=== RISC Zero Circuit Image IDs ===\n");
    println!("These are the cryptographic hashes of your circuit ELF binaries.");
    println!("Register these on-chain using register_image_id().\n");

    // Income Proof
    let income_proof_elf = include_bytes!(
        "../../target/riscv32im-risc0-zkvm-elf/docker/income-proof"
    );
    let income_image_id = compute_image_id(income_proof_elf).unwrap();

    println!("=== income-proof ===");
    println!("Image ID (hex): {}", hex::encode(&income_image_id));
    println!("Image ID (bytes): {:?}", income_image_id);
    println!("Register command:");
    println!("  near call zk-verifier.testnet register_image_id \\");
    println!("    '{{\"proof_type\":\"income_threshold\",\"image_id\":{:?}}}' \\", income_image_id.to_vec());
    println!("    --accountId admin.testnet --gas 300000000000000\n");

    // Payment Proof
    let payment_proof_elf = include_bytes!(
        "../../target/riscv32im-risc0-zkvm-elf/docker/payment-proof"
    );
    let payment_image_id = compute_image_id(payment_proof_elf).unwrap();

    println!("=== payment-proof ===");
    println!("Image ID (hex): {}", hex::encode(&payment_image_id));
    println!("Image ID (bytes): {:?}", payment_image_id);
    println!("Register command:");
    println!("  near call zk-verifier.testnet register_image_id \\");
    println!("    '{{\"proof_type\":\"payment\",\"image_id\":{:?}}}' \\", payment_image_id.to_vec());
    println!("    --accountId admin.testnet --gas 300000000000000\n");

    // Balance Proof
    let balance_proof_elf = include_bytes!(
        "../../target/riscv32im-risc0-zkvm-elf/docker/balance-proof"
    );
    let balance_image_id = compute_image_id(balance_proof_elf).unwrap();

    println!("=== balance-proof ===");
    println!("Image ID (hex): {}", hex::encode(&balance_image_id));
    println!("Image ID (bytes): {:?}", balance_image_id);
    println!("Register command:");
    println!("  near call zk-verifier.testnet register_image_id \\");
    println!("    '{{\"proof_type\":\"balance\",\"image_id\":{:?}}}' \\", balance_image_id.to_vec());
    println!("    --accountId admin.testnet --gas 300000000000000\n");

    println!("=== Summary ===");
    println!("You need to register these image IDs AFTER registering the verification key.");
    println!("The verification key is universal, but each circuit has its own image_id.");
    println!("\nTo register all at once, use the script:");
    println!("  ./scripts/register_image_ids.sh zk-verifier.testnet admin.testnet\n");
}

#[test]
fn example_new_circuit_image_id() {
    println!("\n=== Example: Computing Image ID for a New Circuit ===\n");
    println!("If you create a new circuit at circuits/my-new-proof, follow these steps:\n");

    println!("1. Build the circuit:");
    println!("   cargo build -p my-new-proof --release \\");
    println!("     --target riscv32im-risc0-zkvm-elf \\");
    println!("     --target-dir target/riscv32im-risc0-zkvm-elf\n");

    println!("2. Add to this test file:");
    println!("   let my_proof_elf = include_bytes!(");
    println!("       \"../../target/riscv32im-risc0-zkvm-elf/docker/my-new-proof\"");
    println!("   );");
    println!("   let my_image_id = compute_image_id(my_proof_elf).unwrap();\n");

    println!("3. Run this test to get the image_id:");
    println!("   cargo test -p proof-server --test compute_image_ids -- --nocapture\n");

    println!("4. Register on-chain:");
    println!("   near call zk-verifier.testnet register_image_id \\");
    println!("     '{{\"proof_type\":\"my_new_proof\",\"image_id\":[...]}}' \\");
    println!("     --accountId admin.testnet\n");

    println!("5. Update proof-server to include the new circuit type.\n");
}
