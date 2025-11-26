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
    // The contract stores bytes internally and returns them as byte arrays
    let expected_x_hex = vk["alpha_g1"]["x"].as_str().unwrap().trim_start_matches("0x");
    let expected_x_bytes = hex::decode(expected_x_hex).unwrap();
    let queried_x_bytes: Vec<u8> = serde_json::from_value(query_result["alpha_g1"]["x"].clone()).unwrap();

    assert_eq!(
        queried_x_bytes,
        expected_x_bytes,
        "Alpha G1 x coordinate mismatch"
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
