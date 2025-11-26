// Utility to extract RISC Zero Groth16 verification key
// Run with: cargo test --test extract_vk -- --nocapture

use risc0_groth16;

#[test]
fn extract_verification_key() {
    // Get the RISC Zero Groth16 verification key
    let vk = risc0_groth16::verifying_key();

    // The VerifyingKey is a newtype wrapper, access inner field with .0
    let ark_vk = &vk.0;

    println!("\n=== RISC Zero Groth16 Verification Key ===\n");
    println!("⚠️  IMPORTANT: RISC Zero uses ONE universal verification key");
    println!("    for ALL circuits (verified via recursion).\n");

    // Extract alpha_g1
    let alpha = &ark_vk.alpha_g1;
    println!("alpha_g1 (G1 point):");
    println!("  Affine coords exist: {:?}", alpha.is_on_curve());

    // Extract beta_g2
    let beta = &ark_vk.beta_g2;
    println!("\nbeta_g2 (G2 point):");
    println!("  Affine coords exist: {:?}", beta.is_on_curve());

    // Extract gamma_g2
    let gamma = &ark_vk.gamma_g2;
    println!("\ngamma_g2 (G2 point):");
    println!("  Affine coords exist: {:?}", gamma.is_on_curve());

    // Extract delta_g2
    let delta = &ark_vk.delta_g2;
    println!("\ndelta_g2 (G2 point):");
    println!("  Affine coords exist: {:?}", delta.is_on_curve());

    // Extract gamma_abc_g1 (IC points)
    println!("\ngamma_abc_g1 (IC points):");
    println!("  Total IC points: {}", ark_vk.gamma_abc_g1.len());
    println!("  Public inputs: {}", ark_vk.gamma_abc_g1.len() - 1);

    println!("\n=== Summary ===");
    println!("This is RISC Zero's universal Groth16 verification key.");
    println!("It verifies the RECURSION circuit, not individual application circuits.");
    println!("\nApplication circuit verification happens in the STARK layer.");
    println!("The Groth16 layer only proves: 'this STARK proof is valid'");

    println!("\n=== Registration ===");
    println!("You can register this SAME key for ALL proof types:");
    println!("  - IncomeThreshold");
    println!("  - IncomeRange");
    println!("  - CreditScore");
    println!("  - Payment");
    println!("  - Balance");
}
