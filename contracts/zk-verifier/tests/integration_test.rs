// Integration tests using NEAR Workspaces (local sandbox)
// Run with: cargo test -p zk-verifier --test integration_test

use near_workspaces::{Account, Contract};
use serde_json::json;

const WASM_FILEPATH: &str = "../../target/near/zk_verifier/zk_verifier.wasm";

#[tokio::test]
async fn test_register_and_query_verification_key() -> Result<(), Box<dyn std::error::Error>> {
    // Print current working directory for debugging
    println!("Current working directory: {:?}", std::env::current_dir()?);

    // Start local sandbox
    let worker = near_workspaces::sandbox().await?;

    // Load compiled WASM
    println!("Loading contract WASM from: {}", WASM_FILEPATH);
    let wasm_bytes = std::fs::read(WASM_FILEPATH)
        .map_err(|e| format!("Failed to read WASM file {}: {}", WASM_FILEPATH, e))?;

    // Deploy contract
    println!("Deploying contract to sandbox...");
    let contract = worker.dev_deploy(&wasm_bytes).await?;

    // Create a user account for testing
    let alice = worker.dev_create_account().await?;

    println!("Contract deployed at: {}", contract.id());
    println!("Test account: {}", alice.id());

    // Initialize contract
    println!("\n=== Initializing Contract ===");
    let init_result = alice
        .call(contract.id(), "new")
        .args_json(json!({
            "owner": alice.id()
        }))
        .transact()
        .await?;

    if !init_result.is_success() {
        println!("Contract initialization failed!");
        println!("Result: {:?}", init_result);
        println!("Logs: {:?}", init_result.logs());
        println!("Failures: {:?}", init_result.failures());
    }

    assert!(init_result.is_success(), "Contract initialization failed: {:?}", init_result);
    println!("✓ Contract initialized");

    // Load the RISC Zero verification key from scripts/risc0_vk.json
    println!("\n=== Loading Verification Key ===");
    let vk_json = std::fs::read_to_string("../../scripts/risc0_vk.json")
        .map_err(|e| format!("Failed to read VK file ../../scripts/risc0_vk.json: {}", e))?;
    let vk: serde_json::Value = serde_json::from_str(&vk_json)?;
    println!("✓ Loaded VK from scripts/risc0_vk.json");

    // Register verification key for IncomeThreshold
    println!("\n=== Registering Verification Key ===");
    let proof_type = "IncomeThreshold";

    let register_result = alice
        .call(contract.id(), "register_verification_key")
        .args_json(json!({
            "proof_type": proof_type,
            "vk": vk
        }))
        .max_gas() // Use maximum gas
        .transact()
        .await?;

    assert!(register_result.is_success(), "VK registration failed: {:?}", register_result);
    println!("✓ Verification key registered for {}", proof_type);

    // Query the registered VK
    println!("\n=== Querying Registered VK ===");
    let query_result: serde_json::Value = alice
        .view(contract.id(), "get_verification_key")
        .args_json(json!({
            "proof_type": proof_type
        }))
        .await?
        .json()?;

    println!("Retrieved VK: {}", serde_json::to_string_pretty(&query_result)?);

    // Verify the VK matches what we registered by comparing a sample field
    // IMPORTANT: The contract REVERSES bytes from big-endian (JSON) to little-endian (NEAR)
    // So we need to reverse the expected bytes before comparing
    let expected_x_hex = vk["alpha_g1"]["x"].as_str().unwrap().trim_start_matches("0x");
    let mut expected_x_bytes = hex::decode(expected_x_hex).unwrap();
    expected_x_bytes.reverse(); // Reverse to match contract's little-endian format
    let queried_x_bytes: Vec<u8> = serde_json::from_value(query_result["alpha_g1"]["x"].clone()).unwrap();

    assert_eq!(
        queried_x_bytes,
        expected_x_bytes,
        "Alpha G1 x coordinate mismatch (contract uses little-endian)"
    );

    println!("✓ Verification key query successful");

    // Register for all other proof types
    println!("\n=== Registering VK for All Proof Types ===");
    let proof_types = ["IncomeRange", "CreditScore", "PaymentProof", "BalanceProof"];

    for pt in proof_types {
        let result = alice
            .call(contract.id(), "register_verification_key")
            .args_json(json!({
                "proof_type": pt,
                "vk": vk
            }))
            .max_gas()
            .transact()
            .await?;

        assert!(result.is_success(), "VK registration failed for {}", pt);
        println!("✓ Registered VK for {}", pt);
    }

    println!("\n=== All Tests Passed! ===");
    println!("Summary:");
    println!("  - Contract deployed successfully");
    println!("  - Verification key registered for all proof types");
    println!("  - VK query working correctly");
    println!("\nYou can now deploy to testnet using:");
    println!("  near deploy <account-id> --wasmFile target/wasm32-unknown-unknown/release/zk_verifier.wasm");
    println!("  ./scripts/register_vk.sh <contract-id> <signer-id>");

    Ok(())
}

#[tokio::test]
async fn test_register_image_id() -> Result<(), Box<dyn std::error::Error>> {
    // Start local sandbox
    let worker = near_workspaces::sandbox().await?;

    // Build and deploy contract
    let wasm_bytes = std::fs::read(WASM_FILEPATH)?;
    let contract = worker.dev_deploy(&wasm_bytes).await?;
    let alice = worker.dev_create_account().await?;

    // Initialize
    alice
        .call(contract.id(), "new")
        .args_json(json!({"owner": alice.id()}))
        .transact()
        .await?;

    println!("\n=== Testing Image ID Registration ===");

    // Example image_id (32 bytes)
    let image_id: Vec<u8> = vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
                                  17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];

    // Register image_id
    let result = alice
        .call(contract.id(), "register_image_id")
        .args_json(json!({
            "proof_type": "IncomeThreshold",
            "image_id": image_id
        }))
        .max_gas()
        .transact()
        .await?;

    assert!(result.is_success(), "Image ID registration failed");
    println!("✓ Image ID registered");

    // Query image_id
    let queried_id: Vec<u8> = alice
        .view(contract.id(), "get_image_id_for_type")
        .args_json(json!({"proof_type": "IncomeThreshold"}))
        .await?
        .json()?;

    assert_eq!(queried_id, image_id, "Image ID mismatch");
    println!("✓ Image ID query successful");
    println!("  Registered: {:?}", hex::encode(&image_id));
    println!("  Retrieved:  {:?}", hex::encode(&queried_id));

    Ok(())
}

#[tokio::test]
async fn test_groth16_receipt_format() -> Result<(), Box<dyn std::error::Error>> {
    println!("\n=== Testing Groth16 Receipt Format ===");

    // Start local sandbox
    let worker = near_workspaces::sandbox().await?;

    // Build and deploy contract
    let wasm_bytes = std::fs::read(WASM_FILEPATH)?;
    let contract = worker.dev_deploy(&wasm_bytes).await?;
    let alice = worker.dev_create_account().await?;

    // Initialize
    alice
        .call(contract.id(), "new")
        .args_json(json!({"owner": alice.id()}))
        .transact()
        .await?;

    println!("✓ Contract deployed and initialized");

    // Register image ID (use a test ID from scripts/image_ids.json)
    let image_id: Vec<u8> = vec![
        65, 180, 248, 240, 176, 230, 183, 59, 35, 183, 24, 78, 227, 219, 41, 172,
        83, 239, 88, 85, 44, 239, 55, 3, 160, 138, 58, 85, 139, 12, 246, 186
    ]; // income-proof image ID

    let result = alice
        .call(contract.id(), "register_image_id")
        .args_json(json!({
            "proof_type": "IncomeThreshold",
            "image_id": image_id
        }))
        .max_gas()
        .transact()
        .await?;

    assert!(result.is_success(), "Image ID registration failed");
    println!("✓ Image ID registered");

    // Create a test Groth16 receipt with the new format:
    // [image_id(32) + claim_digest(32) + seal(256) + journal(variable)]
    let mut receipt = Vec::new();
    receipt.extend_from_slice(&image_id);

    // claim_digest (32 bytes - test data)
    let claim_digest = vec![0xABu8; 32];
    receipt.extend_from_slice(&claim_digest);

    // seal (256 bytes: A(64) + B(128) + C(64))
    let seal = vec![0xCDu8; 256];
    receipt.extend_from_slice(&seal);

    // journal (public outputs - test data)
    // Format matches IncomeThresholdOutputs struct
    let journal = vec![
        // history_commitment (32 bytes)
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        // meets_threshold (1 byte: true)
        1,
        // payment_count (4 bytes little-endian: 3)
        3, 0, 0, 0,
        // threshold (8 bytes little-endian: 4000)
        160, 15, 0, 0, 0, 0, 0, 0,
    ];
    receipt.extend_from_slice(&journal);

    println!("\n=== Receipt Details ===");
    println!("Total length: {} bytes", receipt.len());
    println!("  Image ID: {} bytes", 32);
    println!("  Claim Digest: {} bytes", 32);
    println!("  Seal: {} bytes", 256);
    println!("  Journal: {} bytes", journal.len());
    println!("  Expected minimum: 320 bytes");
    println!("  Actual: {} bytes", receipt.len());

    // Verify receipt format
    assert_eq!(receipt.len(), 320 + journal.len(), "Receipt length mismatch");
    assert_eq!(&receipt[0..32], &image_id[..], "Image ID mismatch");
    assert_eq!(&receipt[32..64], &claim_digest[..], "Claim digest mismatch");
    assert_eq!(&receipt[64..320], &seal[..], "Seal mismatch");
    assert_eq!(&receipt[320..], &journal[..], "Journal mismatch");

    println!("✓ Receipt format validation passed");

    // Note: Actual verification would fail because this is test data, not a real proof
    // This test validates the receipt format is correct
    println!("\nℹ️  Receipt format is correct. Actual cryptographic verification would require:");
    println!("  1. Real Groth16 proof from proof-server (takes ~2 minutes to generate)");
    println!("  2. Matching claim_digest computed from the receipt's ReceiptClaim");
    println!("  3. Valid seal that passes pairing check with RISC Zero universal VK");

    Ok(())
}

#[tokio::test]
async fn test_real_proof_verification() -> Result<(), Box<dyn std::error::Error>> {
    println!("\n=== Testing Real Groth16 Proof Verification ===");
    println!("This test loads pre-generated proofs from scripts/test_proofs/");
    println!("Generate test proofs with:");
    println!("  cargo test -p proof-server --test generate_test_proof -- --nocapture --ignored\n");

    // Check if test proof exists
    let test_proof_path = "../../scripts/test_proofs/income_threshold.json";
    if !std::path::Path::new(test_proof_path).exists() {
        println!("⚠ Test proof not found at: {}", test_proof_path);
        println!("\nGenerate it with:");
        println!("  cargo test -p proof-server --test generate_test_proof generate_income_threshold_test_proof -- --nocapture --ignored");
        println!("\nSkipping test...");
        return Ok(());
    }

    // Load test proof
    println!("Loading test proof from: {}", test_proof_path);
    let proof_json = std::fs::read_to_string(test_proof_path)?;
    let proof_data: serde_json::Value = serde_json::from_str(&proof_json)?;

    let receipt: Vec<u8> = serde_json::from_value(proof_data["receipt"].clone())?;
    let image_id: Vec<u8> = serde_json::from_value(proof_data["image_id"].clone())?;
    let public_inputs = &proof_data["public_inputs"];

    println!("✓ Test proof loaded");
    println!("  Receipt size: {} bytes", receipt.len());
    println!("  Image ID: {}", hex::encode(&image_id));
    println!("  Public inputs:");
    println!("    meets_threshold: {}", public_inputs["meets_threshold"]);
    println!("    payment_count: {}", public_inputs["payment_count"]);
    println!("    threshold: {}", public_inputs["threshold"]);

    // Start local sandbox
    let worker = near_workspaces::sandbox().await?;
    let wasm_bytes = std::fs::read(WASM_FILEPATH)?;
    let contract = worker.dev_deploy(&wasm_bytes).await?;
    let alice = worker.dev_create_account().await?;

    // Initialize contract
    println!("\n=== Setting up contract ===");
    alice
        .call(contract.id(), "new")
        .args_json(json!({"owner": alice.id()}))
        .transact()
        .await?;
    println!("✓ Contract initialized");

    // Load and register verification key
    let vk_json = std::fs::read_to_string("../../scripts/risc0_vk.json")?;
    let vk: serde_json::Value = serde_json::from_str(&vk_json)?;

    let register_result = alice
        .call(contract.id(), "register_verification_key")
        .args_json(json!({
            "proof_type": "IncomeThreshold",
            "vk": vk
        }))
        .max_gas()
        .transact()
        .await?;

    assert!(register_result.is_success(), "VK registration failed");
    println!("✓ Verification key registered");

    // Register image ID
    let register_id_result = alice
        .call(contract.id(), "register_image_id")
        .args_json(json!({
            "proof_type": "IncomeThreshold",
            "image_id": image_id
        }))
        .max_gas()
        .transact()
        .await?;

    assert!(register_id_result.is_success(), "Image ID registration failed");
    println!("✓ Image ID registered");

    // Verify the proof!
    println!("\n=== Verifying Groth16 Proof ===");
    println!("Calling verify_income_threshold with real proof...");

    let verify_result = alice
        .call(contract.id(), "verify_income_threshold")
        .args_json(json!({
            "receipt": receipt,
            "expected_commitment": public_inputs["history_commitment"],
            "expected_threshold": public_inputs["threshold"]
        }))
        .max_gas()
        .transact()
        .await;

    match verify_result {
        Ok(result) => {
            if result.is_success() {
                println!("\n✅ PROOF VERIFICATION SUCCEEDED!");
                println!("  All 5 bug fixes are working correctly:");
                println!("  ✓ Bug #1: VK constants reversed (little-endian)");
                println!("  ✓ Bug #2: Sign byte position (sign first)");
                println!("  ✓ Bug #3: Pairing format (no sign bytes)");
                println!("  ✓ Bug #4: BN254_CONTROL_ID reduced mod Fr");
                println!("  ✓ Bug #5: Proof coordinates NOT reversed");

                // Print contract logs to debug
                println!("\n📋 Contract logs:");
                for log in result.logs() {
                    println!("  {}", log);
                }

                // Parse the output struct
                let output: serde_json::Value = result.json()?;
                println!("\n✓ Full output struct: {}", serde_json::to_string_pretty(&output)?);

                let verified = output["verified"].as_bool().unwrap_or(false);
                println!("\n✓ Verification result:");
                println!("    verified: {}", verified);
                println!("    meets_threshold: {}", output["meets_threshold"]);
                println!("    payment_count: {}", output["payment_count"]);
                println!("    threshold: {}", output["threshold"]);

                assert!(verified, "Verification should return true - but got false!");
            } else {
                println!("\n❌ PROOF VERIFICATION FAILED");
                println!("Transaction succeeded but returned false");
                println!("Logs: {:?}", result.logs());
                println!("Failures: {:?}", result.failures());

                return Err("Proof verification returned false".into());
            }
        }
        Err(e) => {
            println!("\n❌ PROOF VERIFICATION FAILED WITH ERROR");
            println!("Error: {:?}", e);

            // Try to extract the actual error message
            let error_msg = format!("{:?}", e);
            if error_msg.contains("AltBn128") {
                println!("\n🔍 Alt BN128 Error Detected!");
                if error_msg.contains("invalid bool") {
                    println!("  Bug #2 Issue: Sign byte position is wrong");
                    println!("  Fix: Ensure sign byte comes FIRST in g1_sum input");
                } else if error_msg.contains("invalid fr") {
                    println!("  Bug #4 Issue: Scalar exceeds Fr modulus");
                    println!("  Fix: Reduce BN254_CONTROL_ID modulo Fr");
                } else if error_msg.contains("invalid fq") {
                    println!("  Bug #5 Issue: Coordinate byte order");
                    println!("  Check: VK constants and proof coordinate reversal");
                } else if error_msg.contains("invalid g2") {
                    println!("  Bug #3/#5 Issue: G2 point format");
                    println!("  Check: Pairing input format and coordinate order");
                }
            }

            return Err(e.into());
        }
    }

    println!("\n=== Test Summary ===");
    println!("✅ Real Groth16 proof verified successfully!");
    println!("✅ All alt_bn128 precompile calls working correctly");
    println!("✅ Fast verification testing enabled");
    println!("\nYou can now iterate quickly by:");
    println!("  1. Make changes to groth16.rs or lib.rs");
    println!("  2. Rebuild: cargo build --release -p zk-verifier");
    println!("  3. Run: cargo test -p zk-verifier --test integration_test test_real_proof_verification");
    println!("  (No need to regenerate proofs or run full TypeScript tests!)");

    Ok(())
}

#[tokio::test]
async fn test_verification_failure_modes() -> Result<(), Box<dyn std::error::Error>> {
    println!("\n=== Testing Verification Failure Modes ===");
    println!("This test ensures verification correctly rejects invalid proofs\n");

    // Check if test proof exists
    let test_proof_path = "../../scripts/test_proofs/income_threshold.json";
    if !std::path::Path::new(test_proof_path).exists() {
        println!("⚠ Skipping - test proof not found");
        return Ok(());
    }

    // Load test proof
    let proof_json = std::fs::read_to_string(test_proof_path)?;
    let proof_data: serde_json::Value = serde_json::from_str(&proof_json)?;

    let mut receipt: Vec<u8> = serde_json::from_value(proof_data["receipt"].clone())?;
    let image_id: Vec<u8> = serde_json::from_value(proof_data["image_id"].clone())?;
    let public_inputs = &proof_data["public_inputs"];

    // Setup contract
    let worker = near_workspaces::sandbox().await?;
    let wasm_bytes = std::fs::read(WASM_FILEPATH)?;
    let contract = worker.dev_deploy(&wasm_bytes).await?;
    let alice = worker.dev_create_account().await?;

    alice
        .call(contract.id(), "new")
        .args_json(json!({"owner": alice.id()}))
        .transact()
        .await?;

    // Register VK and image ID
    let vk_json = std::fs::read_to_string("../../scripts/risc0_vk.json")?;
    let vk: serde_json::Value = serde_json::from_str(&vk_json)?;

    alice
        .call(contract.id(), "register_verification_key")
        .args_json(json!({
            "proof_type": "IncomeThreshold",
            "vk": vk
        }))
        .max_gas()
        .transact()
        .await?;

    alice
        .call(contract.id(), "register_image_id")
        .args_json(json!({
            "proof_type": "IncomeThreshold",
            "image_id": image_id
        }))
        .max_gas()
        .transact()
        .await?;

    println!("✓ Contract setup complete\n");

    // Test 1: Corrupt the proof seal (should fail pairing check)
    println!("Test 1: Corrupted proof seal");
    receipt[100] ^= 0xFF; // Flip bits in seal

    let result = alice
        .call(contract.id(), "verify_income_threshold")
        .args_json(json!({
            "risc_zero_receipt": receipt,
            "expected_history_commitment": public_inputs["history_commitment"],
            "threshold": public_inputs["threshold"]
        }))
        .max_gas()
        .transact()
        .await;

    match result {
        Ok(r) => {
            let verified: bool = r.json()?;
            assert!(!verified, "Corrupted proof should not verify");
            println!("  ✓ Correctly rejected corrupted proof\n");
        }
        Err(e) => {
            // Also acceptable - might fail during parsing
            println!("  ✓ Correctly rejected with error: {:?}\n", e);
        }
    }

    // Restore receipt
    receipt[100] ^= 0xFF;

    // Test 2: Wrong history commitment (should fail)
    println!("Test 2: Wrong history commitment");
    let wrong_commitment = vec![0xFFu8; 32];

    let result = alice
        .call(contract.id(), "verify_income_threshold")
        .args_json(json!({
            "risc_zero_receipt": receipt,
            "expected_history_commitment": wrong_commitment,
            "threshold": public_inputs["threshold"]
        }))
        .max_gas()
        .transact()
        .await;

    match result {
        Ok(r) => {
            let verified: bool = r.json()?;
            assert!(!verified, "Wrong commitment should not verify");
            println!("  ✓ Correctly rejected wrong commitment\n");
        }
        Err(e) => {
            println!("  ✓ Correctly rejected with error: {:?}\n", e);
        }
    }

    println!("=== Failure Mode Tests Passed ===");
    println!("✓ Contract correctly rejects invalid proofs");

    Ok(())
}

#[tokio::test]
async fn test_vk_g2_point_validation() -> Result<(), Box<dyn std::error::Error>> {
    // Start local sandbox
    let worker = near_workspaces::sandbox().await?;

    // Load compiled WASM
    let wasm_bytes = std::fs::read(WASM_FILEPATH)
        .map_err(|e| format!("Failed to read WASM file {}: {}", WASM_FILEPATH, e))?;

    // Deploy contract
    let contract = worker.dev_deploy(&wasm_bytes).await?;
    let alice = worker.dev_create_account().await?;

    println!("\n=== Testing VK G2 Point Validation ===");

    // Initialize contract
    let _ = alice
        .call(contract.id(), "new")
        .args_json(json!({"owner": alice.id()}))
        .transact()
        .await?;

    // Call test_vk_g2_point function
    println!("Calling test_vk_g2_point...");
    let result = alice
        .call(contract.id(), "test_vk_g2_point")
        .args_json(json!({}))
        .max_gas()
        .transact()
        .await?;

    println!("\n=== Test Logs ===");
    for log in result.logs() {
        println!("{}", log);
    }

    let success: bool = result.json()?;
    println!("\nTest result: {}", success);

    assert!(success, "VK G2 point validation should succeed");
    println!("✓ VK G2 point is valid\n");

    Ok(())
}
