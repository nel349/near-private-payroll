/// Test to check RISC Zero control IDs match the contract
/// Run with: cargo test -p proof-server --test check_control_ids -- --nocapture

use risc0_circuit_recursion::control_id::{ALLOWED_CONTROL_ROOT, BN254_IDENTITY_CONTROL_ID};

#[test]
fn show_control_ids() {
    println!("\n=== RISC Zero Control IDs ===\n");

    println!("ALLOWED_CONTROL_ROOT:");
    println!("  Hex: {}", hex::encode(ALLOWED_CONTROL_ROOT));
    println!("  Bytes: {:?}\n", ALLOWED_CONTROL_ROOT);

    println!("BN254_IDENTITY_CONTROL_ID:");
    println!("  Hex: {}", hex::encode(BN254_IDENTITY_CONTROL_ID));
    println!("  Bytes: {:?}\n", BN254_IDENTITY_CONTROL_ID);

    println!("\n=== Expected in Contract (zk-verifier/src/lib.rs:723-734) ===\n");
    println!("const CONTROL_ROOT: [u8; 32] = hex_literal::hex!(");
    println!("    \"{}\"", hex::encode(ALLOWED_CONTROL_ROOT));
    println!(");");
    println!();
    println!("const BN254_CONTROL_ID: [u8; 32] = hex_literal::hex!(");
    println!("    \"{}\"", hex::encode(BN254_IDENTITY_CONTROL_ID));
    println!(");");

    println!("\n=== Verification ===");

    // Hardcoded values from contract
    const CONTRACT_CONTROL_ROOT: &str = "8b6dcf11d463ac455361ce8a1e8b7e41e8663d8e1881d9b785ebdb2e9f9c3f7c";
    const CONTRACT_BN254_ID_REDUCED: &str = "2f4d79bbb8a7d40e3810c50b21839bc61b2b9ae1b96b0b00b4452017966e4401";
    const CONTRACT_BN254_ID_ORIGINAL: &str = "c07a65145c3cb48b6101962ea607a4dd93c753bb26975cb47feb00d3666e4404";

    let actual_control_root = hex::encode(ALLOWED_CONTROL_ROOT);
    let actual_bn254_id = hex::encode(BN254_IDENTITY_CONTROL_ID);

    println!("\nCONTROL_ROOT:");
    println!("  Contract: {}", CONTRACT_CONTROL_ROOT);
    println!("  Current:  {}", actual_control_root);
    if actual_control_root == CONTRACT_CONTROL_ROOT {
        println!("  ✓ MATCH - Control root is correct!");
    } else {
        println!("  ✗ MISMATCH - Contract needs update!");
        println!("\nFIX: Update contracts/zk-verifier/src/lib.rs line 723-725:");
        println!("const CONTROL_ROOT: [u8; 32] = hex_literal::hex!(");
        println!("    \"{}\"", actual_control_root);
        println!(");");
    }

    println!("\nBN254_CONTROL_ID:");
    println!("  Contract (original): {}", CONTRACT_BN254_ID_ORIGINAL);
    println!("  Contract (reduced):  {}", CONTRACT_BN254_ID_REDUCED);
    println!("  Current:             {}", actual_bn254_id);
    if actual_bn254_id == CONTRACT_BN254_ID_ORIGINAL {
        println!("  ✓ MATCH - Using original value (will be reduced in contract)");
    } else if actual_bn254_id == CONTRACT_BN254_ID_REDUCED {
        println!("  ⚠ Contract is using pre-reduced value");
    } else {
        println!("  ✗ MISMATCH - BN254_IDENTITY_CONTROL_ID changed!");
        println!("\nFIX: Update contracts/zk-verifier/src/lib.rs line 733-735:");
        println!("const BN254_CONTROL_ID: [u8; 32] = hex_literal::hex!(");
        println!("    \"{}\"  // Reduced mod Fr", actual_bn254_id);
        println!(");");
    }
}
