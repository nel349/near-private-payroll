// Integration tests for Intents Adapter using NEAR Workspaces (local sandbox)
// Run with: cargo test -p intents-adapter --test integration_test

use near_workspaces::{Account, Contract};
use serde_json::json;

const WASM_FILEPATH: &str = "../../target/near/intents_adapter/intents_adapter.wasm";

/// Helper to deploy intents adapter contract
async fn deploy_intents_adapter(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    owner: &Account,
    payroll_contract: &str,
    wzec_token: &str,
) -> Result<Contract, Box<dyn std::error::Error>> {
    println!("Loading contract WASM from: {}", WASM_FILEPATH);
    let wasm_bytes = std::fs::read(WASM_FILEPATH)
        .map_err(|e| format!("Failed to read WASM file {}: {}", WASM_FILEPATH, e))?;

    println!("Deploying intents adapter contract...");
    let contract = worker.dev_deploy(&wasm_bytes).await?;

    println!("Contract deployed at: {}", contract.id());

    // Initialize contract
    println!("Initializing contract...");
    let init_result = owner
        .call(contract.id(), "new")
        .args_json(json!({
            "owner": owner.id(),
            "payroll_contract": payroll_contract,
            "wzec_token": wzec_token,
            "intents_contract": null // Will use default "intents.near"
        }))
        .transact()
        .await?;

    assert!(init_result.is_success(), "Contract initialization failed: {:?}", init_result);
    println!("✓ Contract initialized");

    Ok(contract)
}

#[tokio::test]
async fn test_initialization() -> Result<(), Box<dyn std::error::Error>> {
    let worker = near_workspaces::sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let payroll = worker.dev_create_account().await?;
    let wzec = worker.dev_create_account().await?;

    let contract = deploy_intents_adapter(&worker, &owner, payroll.id().as_str(), wzec.id().as_str()).await?;

    // Verify owner
    let contract_owner: String = owner
        .view(contract.id(), "get_owner")
        .await?
        .json()?;
    assert_eq!(contract_owner, owner.id().to_string());
    println!("✓ Owner verified: {}", contract_owner);

    // Verify payroll contract
    let contract_payroll: String = owner
        .view(contract.id(), "get_payroll_contract")
        .await?
        .json()?;
    assert_eq!(contract_payroll, payroll.id().to_string());
    println!("✓ Payroll contract verified: {}", contract_payroll);

    // Verify wzec token is supported
    let is_supported: bool = owner
        .view(contract.id(), "is_token_supported")
        .args_json(json!({
            "token": wzec.id()
        }))
        .await?
        .json()?;
    assert!(is_supported);
    println!("✓ wZEC token is supported");

    // Verify intents contract address
    let intents_contract: String = owner
        .view(contract.id(), "get_intents_contract")
        .await?
        .json()?;
    println!("✓ Intents contract: {}", intents_contract);

    Ok(())
}

#[tokio::test]
async fn test_relayer_management() -> Result<(), Box<dyn std::error::Error>> {
    let worker = near_workspaces::sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let payroll = worker.dev_create_account().await?;
    let wzec = worker.dev_create_account().await?;
    let relayer = worker.dev_create_account().await?;
    let non_owner = worker.dev_create_account().await?;

    let contract = deploy_intents_adapter(&worker, &owner, payroll.id().as_str(), wzec.id().as_str()).await?;

    // Add relayer as owner
    println!("\n=== Adding Relayer ===");
    let result = owner
        .call(contract.id(), "add_relayer")
        .args_json(json!({
            "relayer": relayer.id()
        }))
        .transact()
        .await?;
    assert!(result.is_success());
    println!("✓ Relayer added: {}", relayer.id());

    // Verify relayer is in the list
    let relayers: Vec<String> = owner
        .view(contract.id(), "get_relayers")
        .await?
        .json()?;
    assert!(relayers.contains(&relayer.id().to_string()));
    println!("✓ Relayer verified in list");

    // Try to add relayer as non-owner (should fail)
    println!("\n=== Testing Non-Owner Access ===");
    let result = non_owner
        .call(contract.id(), "add_relayer")
        .args_json(json!({
            "relayer": "another.near"
        }))
        .transact()
        .await?;
    assert!(!result.is_success());
    println!("✓ Non-owner correctly denied");

    // Remove relayer
    println!("\n=== Removing Relayer ===");
    let result = owner
        .call(contract.id(), "remove_relayer")
        .args_json(json!({
            "relayer": relayer.id()
        }))
        .transact()
        .await?;
    assert!(result.is_success());
    println!("✓ Relayer removed");

    // Verify relayer is removed
    let relayers: Vec<String> = owner
        .view(contract.id(), "get_relayers")
        .await?
        .json()?;
    assert!(!relayers.contains(&relayer.id().to_string()));
    println!("✓ Relayer removal verified");

    Ok(())
}

#[tokio::test]
async fn test_chain_config() -> Result<(), Box<dyn std::error::Error>> {
    let worker = near_workspaces::sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let payroll = worker.dev_create_account().await?;
    let wzec = worker.dev_create_account().await?;

    let contract = deploy_intents_adapter(&worker, &owner, payroll.id().as_str(), wzec.id().as_str()).await?;

    // Get default Zcash config
    println!("\n=== Querying Default Chain Config ===");
    let zcash_config: serde_json::Value = owner
        .view(contract.id(), "get_chain_config")
        .args_json(json!({
            "chain": "Zcash"
        }))
        .await?
        .json()?;

    println!("Zcash config: {}", serde_json::to_string_pretty(&zcash_config)?);
    assert!(zcash_config["deposit_enabled"].as_bool().unwrap());
    assert!(zcash_config["withdrawal_enabled"].as_bool().unwrap());
    assert_eq!(zcash_config["fee_bps"].as_u64().unwrap(), 50); // 0.5%
    println!("✓ Default Zcash config verified");

    // Update chain config
    println!("\n=== Updating Chain Config ===");
    let result = owner
        .call(contract.id(), "update_chain_config")
        .args_json(json!({
            "config": {
                "chain": "Zcash",
                "deposit_enabled": true,
                "withdrawal_enabled": true,
                "min_withdrawal": 5000000u128, // 0.05 ZEC (updated from default)
                "max_withdrawal": 1000000000u128, // 10 ZEC max
                "fee_bps": 25, // 0.25% (reduced fee)
                "bridge_address": "new-zcash-bridge.near"
            }
        }))
        .transact()
        .await?;

    if !result.is_success() {
        println!("Update failed!");
        println!("Result: {:?}", result);
        println!("Logs: {:?}", result.logs());
        println!("Failures: {:?}", result.failures());
    }
    assert!(result.is_success(), "Chain config update failed: {:?}", result);
    println!("✓ Chain config updated");

    // Verify updated config
    let updated_config: serde_json::Value = owner
        .view(contract.id(), "get_chain_config")
        .args_json(json!({
            "chain": "Zcash"
        }))
        .await?
        .json()?;

    assert_eq!(updated_config["min_withdrawal"].as_u64().unwrap(), 5000000);
    assert_eq!(updated_config["fee_bps"].as_u64().unwrap(), 25);
    println!("✓ Updated config verified");

    Ok(())
}

#[tokio::test]
async fn test_token_management() -> Result<(), Box<dyn std::error::Error>> {
    let worker = near_workspaces::sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let payroll = worker.dev_create_account().await?;
    let wzec = worker.dev_create_account().await?;
    let new_token = worker.dev_create_account().await?;

    let contract = deploy_intents_adapter(&worker, &owner, payroll.id().as_str(), wzec.id().as_str()).await?;

    // Verify initial token is supported
    let is_supported: bool = owner
        .view(contract.id(), "is_token_supported")
        .args_json(json!({
            "token": wzec.id()
        }))
        .await?
        .json()?;
    assert!(is_supported);
    println!("✓ wZEC initially supported");

    // Add new token
    println!("\n=== Adding New Token ===");
    let result = owner
        .call(contract.id(), "add_supported_token")
        .args_json(json!({
            "token": new_token.id()
        }))
        .transact()
        .await?;
    assert!(result.is_success());
    println!("✓ New token added: {}", new_token.id());

    // Verify new token is supported
    let is_supported: bool = owner
        .view(contract.id(), "is_token_supported")
        .args_json(json!({
            "token": new_token.id()
        }))
        .await?
        .json()?;
    assert!(is_supported);
    println!("✓ New token verified as supported");

    // Remove token
    println!("\n=== Removing Token ===");
    let result = owner
        .call(contract.id(), "remove_supported_token")
        .args_json(json!({
            "token": new_token.id()
        }))
        .transact()
        .await?;
    assert!(result.is_success());
    println!("✓ Token removed");

    // Verify token is no longer supported
    let is_supported: bool = owner
        .view(contract.id(), "is_token_supported")
        .args_json(json!({
            "token": new_token.id()
        }))
        .await?
        .json()?;
    assert!(!is_supported);
    println!("✓ Token removal verified");

    Ok(())
}

#[tokio::test]
async fn test_stats() -> Result<(), Box<dyn std::error::Error>> {
    let worker = near_workspaces::sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let payroll = worker.dev_create_account().await?;
    let wzec = worker.dev_create_account().await?;

    let contract = deploy_intents_adapter(&worker, &owner, payroll.id().as_str(), wzec.id().as_str()).await?;

    println!("\n=== Querying Stats ===");
    let stats: serde_json::Value = owner
        .view(contract.id(), "get_stats")
        .await?
        .json()?;

    println!("Stats: {}", serde_json::to_string_pretty(&stats)?);

    // Stats should be initialized to zero
    assert_eq!(stats[0].as_u64().unwrap(), 0); // total_deposits
    assert_eq!(stats[1].as_u64().unwrap(), 0); // total_withdrawals
    assert_eq!(stats[2].as_u64().unwrap(), 0); // withdrawal_nonce
    println!("✓ Initial stats verified");

    Ok(())
}

#[tokio::test]
async fn test_ownership_transfer() -> Result<(), Box<dyn std::error::Error>> {
    let worker = near_workspaces::sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let new_owner = worker.dev_create_account().await?;
    let payroll = worker.dev_create_account().await?;
    let wzec = worker.dev_create_account().await?;

    let contract = deploy_intents_adapter(&worker, &owner, payroll.id().as_str(), wzec.id().as_str()).await?;

    // Transfer ownership
    println!("\n=== Transferring Ownership ===");
    let result = owner
        .call(contract.id(), "transfer_ownership")
        .args_json(json!({
            "new_owner": new_owner.id()
        }))
        .transact()
        .await?;
    assert!(result.is_success());
    println!("✓ Ownership transferred to: {}", new_owner.id());

    // Verify new owner
    let contract_owner: String = owner
        .view(contract.id(), "get_owner")
        .await?
        .json()?;
    assert_eq!(contract_owner, new_owner.id().to_string());
    println!("✓ New owner verified");

    // Old owner should no longer be able to add relayers
    println!("\n=== Testing Old Owner Access ===");
    let result = owner
        .call(contract.id(), "add_relayer")
        .args_json(json!({
            "relayer": "some-relayer.near"
        }))
        .transact()
        .await?;
    assert!(!result.is_success());
    println!("✓ Old owner correctly denied access");

    // New owner should be able to add relayers
    println!("\n=== Testing New Owner Access ===");
    let result = new_owner
        .call(contract.id(), "add_relayer")
        .args_json(json!({
            "relayer": "some-relayer.near"
        }))
        .transact()
        .await?;
    assert!(result.is_success());
    println!("✓ New owner has admin access");

    Ok(())
}

#[tokio::test]
async fn test_update_contract_addresses() -> Result<(), Box<dyn std::error::Error>> {
    let worker = near_workspaces::sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let payroll = worker.dev_create_account().await?;
    let wzec = worker.dev_create_account().await?;
    let new_payroll = worker.dev_create_account().await?;
    let new_intents = worker.dev_create_account().await?;

    let contract = deploy_intents_adapter(&worker, &owner, payroll.id().as_str(), wzec.id().as_str()).await?;

    // Update payroll contract
    println!("\n=== Updating Payroll Contract ===");
    let result = owner
        .call(contract.id(), "update_payroll_contract")
        .args_json(json!({
            "payroll_contract": new_payroll.id()
        }))
        .transact()
        .await?;
    assert!(result.is_success());

    let updated_payroll: String = owner
        .view(contract.id(), "get_payroll_contract")
        .await?
        .json()?;
    assert_eq!(updated_payroll, new_payroll.id().to_string());
    println!("✓ Payroll contract updated to: {}", new_payroll.id());

    // Update intents contract
    println!("\n=== Updating Intents Contract ===");
    let result = owner
        .call(contract.id(), "update_intents_contract")
        .args_json(json!({
            "intents_contract": new_intents.id()
        }))
        .transact()
        .await?;
    assert!(result.is_success());

    let updated_intents: String = owner
        .view(contract.id(), "get_intents_contract")
        .await?
        .json()?;
    assert_eq!(updated_intents, new_intents.id().to_string());
    println!("✓ Intents contract updated to: {}", new_intents.id());

    Ok(())
}
