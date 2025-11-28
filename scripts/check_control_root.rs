#!/usr/bin/env rust-script
//! ```cargo
//! [dependencies]
//! risc0-circuit-recursion = "3.0"
//! hex = "0.4"
//! ```

use risc0_circuit_recursion::control_id::{ALLOWED_CONTROL_ROOT, BN254_IDENTITY_CONTROL_ID};

fn main() {
    println!("\n=== RISC Zero Control IDs ===\n");

    println!("ALLOWED_CONTROL_ROOT:");
    println!("  Hex: {}", hex::encode(ALLOWED_CONTROL_ROOT));
    println!("  Bytes: {:?}\n", ALLOWED_CONTROL_ROOT);

    println!("BN254_IDENTITY_CONTROL_ID:");
    println!("  Hex: {}", hex::encode(BN254_IDENTITY_CONTROL_ID));
    println!("  Bytes: {:?}\n", BN254_IDENTITY_CONTROL_ID);

    println!("\n=== Expected in Contract (zk-verifier/src/lib.rs) ===\n");
    println!("const CONTROL_ROOT: [u8; 32] = hex_literal::hex!(");
    println!("    \"{}\"", hex::encode(ALLOWED_CONTROL_ROOT));
    println!(");");
    println!();
    println!("const BN254_CONTROL_ID: [u8; 32] = hex_literal::hex!(");
    println!("    \"{}\"", hex::encode(BN254_IDENTITY_CONTROL_ID));
    println!(");");
}
