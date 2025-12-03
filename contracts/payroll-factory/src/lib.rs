use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
};

/// Payroll contract WASM embedded at compile time
/// This is the standard NEAR factory pattern (used by Sputnik DAO, etc.)
const PAYROLL_WASM: &[u8] = include_bytes!("../../../target/near/payroll_contract/payroll_contract.wasm");

const PAYROLL_CONTRACT_STORAGE: NearToken = NearToken::from_near(5);
const INIT_GAS: Gas = Gas::from_tgas(50);  // Gas for initialization call
const CALLBACK_GAS: Gas = Gas::from_tgas(20); // Gas for callback

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct PayrollInitArgs {
    pub owner: AccountId,
    pub wzec_token: AccountId,
    pub zk_verifier: AccountId,
    pub company_public_key: Vec<u8>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct PayrollFactory {
    /// Owner of the factory
    pub owner: AccountId,
    /// Infrastructure contract addresses
    pub wzec_token: AccountId,
    pub zk_verifier: AccountId,
    /// Total companies created
    pub total_companies: u64,
}

#[near]
impl PayrollFactory {
    #[init]
    pub fn new(owner: AccountId, wzec_token: AccountId, zk_verifier: AccountId) -> Self {
        Self {
            owner,
            wzec_token,
            zk_verifier,
            total_companies: 0,
        }
    }

    /// Create a new company payroll contract
    ///
    /// Creates a subaccount, deploys the payroll contract, and initializes it
    ///
    /// # Arguments
    /// * `company_name` - Name used to generate subaccount (e.g., "acme-corp")
    /// * `company_public_key` - Public key for encrypting employee data
    ///
    /// # Returns
    /// Promise that resolves to the new contract address
    #[payable]
    pub fn create_company(&mut self, company_name: String, company_public_key: Vec<u8>) -> Promise {

        let attached_deposit = env::attached_deposit();
        require!(
            attached_deposit >= PAYROLL_CONTRACT_STORAGE,
            format!(
                "Attached deposit must be at least {} NEAR for contract storage",
                PAYROLL_CONTRACT_STORAGE.as_near()
            )
        );

        // Sanitize company name for account ID
        let sanitized_name = company_name
            .to_lowercase()
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '-' })
            .collect::<String>()
            .split('-')
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("-");

        require!(
            sanitized_name.len() >= 2 && sanitized_name.len() <= 40,
            "Company name must be 2-40 characters after sanitization"
        );

        // Add timestamp to ensure uniqueness
        let timestamp = env::block_timestamp() / 1_000_000; // Convert to milliseconds
        let subaccount_id: AccountId = format!(
            "{}-{}.{}",
            sanitized_name,
            timestamp,
            env::current_account_id()
        )
        .parse()
        .unwrap();

        let caller = env::predecessor_account_id();

        // Prepare initialization arguments
        let init_args = PayrollInitArgs {
            owner: caller.clone(),
            wzec_token: self.wzec_token.clone(),
            zk_verifier: self.zk_verifier.clone(),
            company_public_key,
        };

        // Create subaccount, deploy contract, and initialize
        // Note: Most gas goes to deployment, only 50 TGas for init
        let promise = Promise::new(subaccount_id.clone())
            .create_account()
            .transfer(PAYROLL_CONTRACT_STORAGE)
            .deploy_contract(PAYROLL_WASM.to_vec())
            .function_call(
                "new".to_string(),
                serde_json::to_vec(&init_args).unwrap(),
                NearToken::from_near(0),
                INIT_GAS,
            );

        // Callback to record creation
        self.total_companies += 1;

        promise.then(
            Self::ext(env::current_account_id())
                .with_static_gas(CALLBACK_GAS)
                .on_company_created(subaccount_id, caller),
        )
    }

    /// Callback after company contract deployment
    #[private]
    pub fn on_company_created(
        &self,
        contract_address: AccountId,
        owner: AccountId,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> AccountId {
        if result.is_err() {
            env::panic_str(&format!(
                "Failed to create company contract for {}",
                owner
            ));
        }

        env::log_str(&format!(
            "Company contract created: {} (owner: {})",
            contract_address, owner
        ));

        contract_address
    }

    /// Get factory stats
    pub fn get_stats(&self) -> FactoryStats {
        FactoryStats {
            total_companies: self.total_companies,
            wzec_token: self.wzec_token.clone(),
            zk_verifier: self.zk_verifier.clone(),
            wasm_size: PAYROLL_WASM.len(),
        }
    }

    /// Check if factory is ready (always true since WASM is embedded)
    pub fn is_ready(&self) -> bool {
        true
    }
}

#[near(serializers=[json])]
pub struct FactoryStats {
    pub total_companies: u64,
    pub wzec_token: AccountId,
    pub zk_verifier: AccountId,
    pub wasm_size: usize,  // Size of embedded WASM in bytes
}
