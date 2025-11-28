//! # NEAR Intents Adapter for Private Payroll
//!
//! This contract bridges the Private Payroll system with NEAR Intents protocol
//! for cross-chain operations:
//!
//! ## Inbound Flow (Company Deposits)
//! 1. Company deposits ZEC on Zcash network to bridge address
//! 2. PoA bridge mints wZEC on NEAR
//! 3. wZEC is deposited into Intents via this adapter
//! 4. Adapter forwards to Payroll contract as company balance
//!
//! ## Outbound Flow (Employee Withdrawals)
//! 1. Employee initiates withdrawal via Payroll contract
//! 2. Payroll transfers wZEC to this adapter
//! 3. Adapter creates intent for cross-chain withdrawal
//! 4. Intents protocol routes to destination chain (Zcash, Solana, etc.)
//!
//! ## Supported Chains
//! - Zcash (shielded addresses for maximum privacy)
//! - Solana
//! - Ethereum
//! - Bitcoin (via PoA bridge)

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::{LookupMap, UnorderedMap};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, ext_contract, near_bindgen, AccountId, BorshStorageKey, Gas, NearSchema,
    NearToken, PanicOnDefault, Promise, PromiseOrValue, PromiseResult,
};
use sha2::{Digest, Sha256};

/// Gas constants for cross-contract calls
const GAS_FOR_FT_TRANSFER: Gas = Gas::from_tgas(30);
const GAS_FOR_FT_TRANSFER_CALL: Gas = Gas::from_tgas(50);
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(20);

/// NEAR Intents contract on mainnet
const INTENTS_CONTRACT: &str = "intents.near";

/// Storage keys
#[derive(BorshStorageKey, BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
pub enum StorageKey {
    PendingDeposits,
    PendingWithdrawals,
    SupportedTokens,
    ChainConfigs,
}

/// Supported destination chains for withdrawals
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq, Debug, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub enum DestinationChain {
    /// Zcash mainnet (shielded or transparent)
    Zcash,
    /// Solana mainnet
    Solana,
    /// Ethereum mainnet
    Ethereum,
    /// Bitcoin mainnet
    Bitcoin,
    /// NEAR (same chain, no bridge needed)
    Near,
}

impl DestinationChain {
    /// Get the chain identifier for intents protocol
    pub fn chain_id(&self) -> &str {
        match self {
            DestinationChain::Zcash => "zcash",
            DestinationChain::Solana => "solana",
            DestinationChain::Ethereum => "ethereum",
            DestinationChain::Bitcoin => "bitcoin",
            DestinationChain::Near => "near",
        }
    }

    /// Validate address format for this chain
    pub fn validate_address(&self, address: &str) -> bool {
        match self {
            DestinationChain::Zcash => {
                // Shielded addresses start with "zs" (Sapling) or "zc" (Sprout)
                // Transparent addresses start with "t1" or "t3"
                address.starts_with("zs") || address.starts_with("zc")
                    || address.starts_with("t1") || address.starts_with("t3")
            }
            DestinationChain::Solana => {
                // Base58 encoded, 32-44 characters
                address.len() >= 32 && address.len() <= 44
            }
            DestinationChain::Ethereum => {
                // 0x prefixed, 42 characters
                address.starts_with("0x") && address.len() == 42
            }
            DestinationChain::Bitcoin => {
                // Various formats: P2PKH (1...), P2SH (3...), Bech32 (bc1...)
                address.starts_with('1') || address.starts_with('3') || address.starts_with("bc1")
            }
            DestinationChain::Near => {
                // NEAR account format
                address.ends_with(".near") || address.ends_with(".testnet")
                    || (address.len() == 64 && address.chars().all(|c| c.is_ascii_hexdigit()))
            }
        }
    }
}

/// Zcash address type for enhanced privacy options
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq, Debug, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub enum ZcashAddressType {
    /// Sapling shielded address (zs...) - recommended for privacy
    Shielded,
    /// Transparent address (t1... or t3...) - like Bitcoin
    Transparent,
}

/// Pending deposit from cross-chain
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct PendingDeposit {
    /// Source chain
    pub source_chain: DestinationChain,
    /// Source transaction hash
    pub source_tx_hash: String,
    /// Amount in smallest unit
    pub amount: u128,
    /// Destination (company account on NEAR)
    pub destination: AccountId,
    /// Timestamp
    pub created_at: u64,
    /// Status
    pub status: DepositStatus,
}

/// Deposit status
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq, Debug, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub enum DepositStatus {
    Pending,
    Confirmed,
    Forwarded,
    Failed,
}

/// Pending withdrawal to cross-chain
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct PendingWithdrawal {
    /// NEAR account initiating withdrawal
    pub initiator: AccountId,
    /// Destination chain
    pub destination_chain: DestinationChain,
    /// Destination address on target chain
    pub destination_address: String,
    /// Token to withdraw
    pub token: AccountId,
    /// Amount in smallest unit
    pub amount: u128,
    /// Created timestamp
    pub created_at: u64,
    /// Status
    pub status: WithdrawalStatus,
    /// Intent ID (after submission to intents protocol)
    pub intent_id: Option<String>,
}

/// Withdrawal status
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq, Debug, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub enum WithdrawalStatus {
    Pending,
    IntentCreated,
    Processing,
    Completed,
    Failed,
}

/// Chain configuration for cross-chain operations
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct ChainConfig {
    /// Chain identifier
    pub chain: DestinationChain,
    /// Is enabled for deposits
    pub deposit_enabled: bool,
    /// Is enabled for withdrawals
    pub withdrawal_enabled: bool,
    /// Minimum withdrawal amount
    pub min_withdrawal: u128,
    /// Maximum withdrawal amount (0 = unlimited)
    pub max_withdrawal: u128,
    /// Fee basis points (100 = 1%)
    pub fee_bps: u16,
    /// Bridge contract/address for this chain
    pub bridge_address: String,
}

/// External interface for Payroll contract
#[ext_contract(ext_payroll)]
pub trait ExtPayroll {
    fn deposit_from_bridge(&mut self, company_id: AccountId, amount: U128, source_chain: String, source_tx: String);
}

/// External interface for FT contract (wZEC)
#[ext_contract(ext_ft)]
pub trait ExtFungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> Promise;
}

/// NEAR Intents Adapter Contract
#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
#[borsh(crate = "near_sdk::borsh")]
pub struct IntentsAdapter {
    /// Contract owner
    pub owner: AccountId,
    /// Payroll contract address
    pub payroll_contract: AccountId,
    /// wZEC token contract address
    pub wzec_token: AccountId,
    /// NEAR Intents contract address
    pub intents_contract: AccountId,
    /// Pending deposits (indexed by source_tx_hash)
    pub pending_deposits: LookupMap<String, PendingDeposit>,
    /// Pending withdrawals (indexed by withdrawal_id)
    pub pending_withdrawals: LookupMap<String, PendingWithdrawal>,
    /// Supported tokens for cross-chain (token_id -> is_supported)
    pub supported_tokens: LookupMap<AccountId, bool>,
    /// Chain configurations
    pub chain_configs: UnorderedMap<String, ChainConfig>,
    /// Total deposits processed
    pub total_deposits: u64,
    /// Total withdrawals processed
    pub total_withdrawals: u64,
    /// Withdrawal nonce for unique IDs
    pub withdrawal_nonce: u64,
    /// Authorized bridge relayers
    pub authorized_relayers: Vec<AccountId>,
}

#[near_bindgen]
impl IntentsAdapter {
    /// Initialize the adapter contract
    #[init]
    pub fn new(
        owner: AccountId,
        payroll_contract: AccountId,
        wzec_token: AccountId,
        intents_contract: Option<AccountId>,
    ) -> Self {
        let intents = intents_contract.unwrap_or_else(|| INTENTS_CONTRACT.parse().unwrap());

        let mut contract = Self {
            owner,
            payroll_contract,
            wzec_token: wzec_token.clone(),
            intents_contract: intents,
            pending_deposits: LookupMap::new(StorageKey::PendingDeposits),
            pending_withdrawals: LookupMap::new(StorageKey::PendingWithdrawals),
            supported_tokens: LookupMap::new(StorageKey::SupportedTokens),
            chain_configs: UnorderedMap::new(StorageKey::ChainConfigs),
            total_deposits: 0,
            total_withdrawals: 0,
            withdrawal_nonce: 0,
            authorized_relayers: vec![],
        };

        // Register wZEC as supported token
        contract.supported_tokens.insert(&wzec_token, &true);

        // Initialize default chain configs
        contract.init_default_chain_configs();

        contract
    }

    /// Initialize default chain configurations
    fn init_default_chain_configs(&mut self) {
        // Zcash config - primary chain for privacy
        let zcash_config = ChainConfig {
            chain: DestinationChain::Zcash,
            deposit_enabled: true,
            withdrawal_enabled: true,
            min_withdrawal: 10_000_000, // 0.1 ZEC (8 decimals)
            max_withdrawal: 0, // unlimited
            fee_bps: 50, // 0.5%
            bridge_address: "zcash-bridge.near".to_string(),
        };
        self.chain_configs.insert(&"zcash".to_string(), &zcash_config);

        // Solana config
        let solana_config = ChainConfig {
            chain: DestinationChain::Solana,
            deposit_enabled: false,
            withdrawal_enabled: true,
            min_withdrawal: 10_000_000,
            max_withdrawal: 0,
            fee_bps: 30, // 0.3%
            bridge_address: "solana-bridge.near".to_string(),
        };
        self.chain_configs.insert(&"solana".to_string(), &solana_config);

        // Ethereum config
        let ethereum_config = ChainConfig {
            chain: DestinationChain::Ethereum,
            deposit_enabled: false,
            withdrawal_enabled: true,
            min_withdrawal: 10_000_000,
            max_withdrawal: 0,
            fee_bps: 100, // 1% (higher due to gas costs)
            bridge_address: "ethereum-bridge.near".to_string(),
        };
        self.chain_configs.insert(&"ethereum".to_string(), &ethereum_config);

        // NEAR config (no bridging needed)
        let near_config = ChainConfig {
            chain: DestinationChain::Near,
            deposit_enabled: true,
            withdrawal_enabled: true,
            min_withdrawal: 1_000_000, // 0.01 ZEC
            max_withdrawal: 0,
            fee_bps: 0, // No fee for same-chain
            bridge_address: "".to_string(),
        };
        self.chain_configs.insert(&"near".to_string(), &near_config);
    }

    // ==================== COMPANY DEPOSIT OPERATIONS ====================

    /// Handle incoming wZEC transfers via ft_transfer_call
    /// Called from wZEC contract
    ///
    /// Message formats:
    /// - Deposit: "deposit:company_id" or "deposit:company_id:source_chain:source_tx"
    /// - Withdrawal: "withdrawal:chain:destination_address"
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let token_contract = env::predecessor_account_id();

        // Verify token is supported
        assert!(
            self.supported_tokens.get(&token_contract).unwrap_or(false),
            "Token not supported"
        );

        // Parse message
        let parts: Vec<&str> = msg.split(':').collect();
        if parts.is_empty() {
            // Refund if empty message
            return PromiseOrValue::Value(amount);
        }

        match parts[0] {
            "deposit" => self.handle_deposit_transfer(sender_id, token_contract, amount, parts),
            "withdrawal" => self.handle_withdrawal_transfer(sender_id, token_contract, amount, parts),
            _ => {
                // Unknown message type, refund
                PromiseOrValue::Value(amount)
            }
        }
    }

    /// Handle deposit transfer
    fn handle_deposit_transfer(
        &mut self,
        sender_id: AccountId,
        token_contract: AccountId,
        amount: U128,
        parts: Vec<&str>,
    ) -> PromiseOrValue<U128> {

        // Extract company ID
        let company_id: AccountId = parts.get(1)
            .expect("Company ID required in message")
            .parse()
            .expect("Invalid company ID");

        // Optional: source chain and tx for cross-chain tracking
        let source_chain = parts.get(2).map(|s| s.to_string());
        let source_tx = parts.get(3).map(|s| s.to_string());

        env::log_str(&format!(
            "Received {} wZEC from {} for company {}",
            amount.0, sender_id, company_id
        ));

        // Forward to payroll contract
        let promise = ext_ft::ext(token_contract)
            .with_static_gas(GAS_FOR_FT_TRANSFER_CALL)
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .ft_transfer_call(
                self.payroll_contract.clone(),
                amount,
                Some(format!("Company deposit from {}", sender_id)),
                "deposit".to_string(),
            );

        self.total_deposits += 1;

        // Log cross-chain source if provided
        if let (Some(chain), Some(tx)) = (source_chain, source_tx) {
            env::log_str(&format!(
                "Cross-chain deposit from {} tx: {}",
                chain, tx
            ));
        }

        PromiseOrValue::Promise(promise.then(
            Self::ext(env::current_account_id())
                .with_static_gas(GAS_FOR_CALLBACK)
                .on_deposit_forwarded(company_id, amount)
        ))
    }

    /// Handle withdrawal transfer from payroll contract
    /// Message format: "withdrawal:chain:destination_address"
    fn handle_withdrawal_transfer(
        &mut self,
        sender_id: AccountId,
        token_contract: AccountId,
        amount: U128,
        parts: Vec<&str>,
    ) -> PromiseOrValue<U128> {
        // Only payroll contract can initiate withdrawals
        if sender_id != self.payroll_contract {
            env::log_str(&format!(
                "Withdrawal rejected: only payroll contract can initiate, got {}",
                sender_id
            ));
            return PromiseOrValue::Value(amount); // Refund
        }

        // Parse withdrawal details
        let chain_str = parts.get(1).expect("Chain required in withdrawal message");
        let destination_address = parts.get(2).expect("Destination address required in withdrawal message");

        // Parse destination chain
        let destination_chain: DestinationChain = match chain_str.to_lowercase().as_str() {
            "zcash" => DestinationChain::Zcash,
            "solana" => DestinationChain::Solana,
            "ethereum" => DestinationChain::Ethereum,
            "bitcoin" => DestinationChain::Bitcoin,
            "near" => DestinationChain::Near,
            _ => {
                env::log_str(&format!("Unknown chain: {}", chain_str));
                return PromiseOrValue::Value(amount); // Refund
            }
        };

        // Validate chain config
        let chain_config = match self.chain_configs.get(&destination_chain.chain_id().to_string()) {
            Some(config) => config,
            None => {
                env::log_str(&format!("Chain not configured: {:?}", destination_chain));
                return PromiseOrValue::Value(amount); // Refund
            }
        };

        if !chain_config.withdrawal_enabled {
            env::log_str(&format!("Withdrawals disabled for chain: {:?}", destination_chain));
            return PromiseOrValue::Value(amount); // Refund
        }

        if amount.0 < chain_config.min_withdrawal {
            env::log_str(&format!(
                "Amount {} below minimum withdrawal {} for chain: {:?}",
                amount.0, chain_config.min_withdrawal, destination_chain
            ));
            return PromiseOrValue::Value(amount); // Refund
        }

        if chain_config.max_withdrawal > 0 && amount.0 > chain_config.max_withdrawal {
            env::log_str(&format!(
                "Amount {} exceeds maximum withdrawal {} for chain: {:?}",
                amount.0, chain_config.max_withdrawal, destination_chain
            ));
            return PromiseOrValue::Value(amount); // Refund
        }

        // Validate destination address
        if !destination_chain.validate_address(destination_address) {
            env::log_str(&format!(
                "Invalid destination address: {} for chain: {:?}",
                destination_address, destination_chain
            ));
            return PromiseOrValue::Value(amount); // Refund
        }

        // Generate withdrawal ID
        self.withdrawal_nonce += 1;
        let withdrawal_id = self.generate_withdrawal_id(&sender_id);

        // Create pending withdrawal
        let withdrawal = PendingWithdrawal {
            initiator: sender_id.clone(),
            destination_chain: destination_chain.clone(),
            destination_address: destination_address.to_string(),
            token: token_contract.clone(),
            amount: amount.0,
            created_at: env::block_timestamp(),
            status: WithdrawalStatus::Pending,
            intent_id: None,
        };

        self.pending_withdrawals.insert(&withdrawal_id, &withdrawal);
        self.total_withdrawals += 1;

        env::log_str(&format!(
            "Withdrawal initiated: {} wZEC from {} to {} on {} (ID: {})",
            amount.0, sender_id, destination_address, destination_chain.chain_id(), withdrawal_id
        ));

        // For NEAR destination, direct transfer
        if destination_chain == DestinationChain::Near {
            let recipient: AccountId = match destination_address.parse() {
                Ok(addr) => addr,
                Err(_) => {
                    env::log_str(&format!("Invalid NEAR address: {}", destination_address));
                    return PromiseOrValue::Value(amount); // Refund
                }
            };

            let promise = ext_ft::ext(token_contract)
                .with_static_gas(GAS_FOR_FT_TRANSFER)
                .with_attached_deposit(NearToken::from_yoctonear(1))
                .ft_transfer(
                    recipient,
                    amount,
                    Some(format!("Payroll withdrawal {}", withdrawal_id)),
                );

            return PromiseOrValue::Promise(promise.then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .on_near_withdrawal_complete(withdrawal_id)
            ));
        }

        // For cross-chain, create intent via ft_transfer_call to intents contract
        let intent_msg = serde_json::json!({
            "action": "cross_chain_transfer",
            "destination_chain": destination_chain.chain_id(),
            "destination_address": destination_address,
            "token": token_contract.to_string(),
            "amount": amount.0.to_string(),
        }).to_string();

        let promise = ext_ft::ext(token_contract)
            .with_static_gas(GAS_FOR_FT_TRANSFER_CALL)
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .ft_transfer_call(
                self.intents_contract.clone(),
                amount,
                Some(format!("Cross-chain withdrawal {}", withdrawal_id)),
                intent_msg,
            );

        // Update status to IntentCreated
        if let Some(mut w) = self.pending_withdrawals.get(&withdrawal_id) {
            w.status = WithdrawalStatus::IntentCreated;
            self.pending_withdrawals.insert(&withdrawal_id, &w);
        }

        PromiseOrValue::Promise(promise.then(
            Self::ext(env::current_account_id())
                .with_static_gas(GAS_FOR_CALLBACK)
                .on_intent_created(withdrawal_id)
        ))
    }

    /// Callback after deposit forwarded to payroll
    #[private]
    pub fn on_deposit_forwarded(&mut self, company_id: AccountId, amount: U128) -> U128 {
        match env::promise_result(0) {
            PromiseResult::Successful(result) => {
                // Parse refund amount from ft_transfer_call result
                let refund: U128 = serde_json::from_slice(&result).unwrap_or(U128(0));

                if refund.0 > 0 {
                    env::log_str(&format!(
                        "Deposit partially refunded: {} of {} for {}",
                        refund.0, amount.0, company_id
                    ));
                } else {
                    env::log_str(&format!(
                        "Deposit successful: {} wZEC for company {}",
                        amount.0, company_id
                    ));
                }

                refund
            }
            _ => {
                env::log_str(&format!(
                    "Deposit failed for company {}, amount {}",
                    company_id, amount.0
                ));
                // Return full amount as refund on failure
                amount
            }
        }
    }

    /// Bridge relayer confirms cross-chain deposit
    /// Called by authorized relayer when ZEC is deposited on Zcash side
    pub fn confirm_cross_chain_deposit(
        &mut self,
        source_tx_hash: String,
        amount: U128,
        company_id: AccountId,
        source_chain: DestinationChain,
    ) {
        self.assert_authorized_relayer();

        let chain_config = self.chain_configs
            .get(&source_chain.chain_id().to_string())
            .expect("Chain not configured");

        assert!(chain_config.deposit_enabled, "Deposits disabled for this chain");

        // Create pending deposit record
        let deposit = PendingDeposit {
            source_chain,
            source_tx_hash: source_tx_hash.clone(),
            amount: amount.0,
            destination: company_id.clone(),
            created_at: env::block_timestamp(),
            status: DepositStatus::Confirmed,
        };

        self.pending_deposits.insert(&source_tx_hash, &deposit);

        env::log_str(&format!(
            "Cross-chain deposit confirmed: {} for company {} (tx: {})",
            amount.0, company_id, source_tx_hash
        ));
    }

    // ==================== EMPLOYEE WITHDRAWAL OPERATIONS ====================

    /// Initiate cross-chain withdrawal for employee
    /// Called by payroll contract when employee wants to withdraw to another chain
    ///
    /// # Arguments
    /// * `employee_id` - Employee's NEAR account
    /// * `destination_chain` - Target blockchain
    /// * `destination_address` - Address on target chain
    /// * `amount` - Amount to withdraw
    pub fn initiate_withdrawal(
        &mut self,
        employee_id: AccountId,
        destination_chain: DestinationChain,
        destination_address: String,
        amount: U128,
    ) -> String {
        // Only payroll contract can initiate withdrawals
        assert_eq!(
            env::predecessor_account_id(),
            self.payroll_contract,
            "Only payroll contract can initiate withdrawals"
        );

        // Validate chain config
        let chain_config = self.chain_configs
            .get(&destination_chain.chain_id().to_string())
            .expect("Chain not configured");

        assert!(chain_config.withdrawal_enabled, "Withdrawals disabled for this chain");
        assert!(
            amount.0 >= chain_config.min_withdrawal,
            "Amount below minimum withdrawal"
        );
        if chain_config.max_withdrawal > 0 {
            assert!(
                amount.0 <= chain_config.max_withdrawal,
                "Amount exceeds maximum withdrawal"
            );
        }

        // Validate destination address
        assert!(
            destination_chain.validate_address(&destination_address),
            "Invalid destination address format"
        );

        // Generate withdrawal ID
        self.withdrawal_nonce += 1;
        let withdrawal_id = self.generate_withdrawal_id(&employee_id);

        // Create pending withdrawal
        let withdrawal = PendingWithdrawal {
            initiator: employee_id.clone(),
            destination_chain: destination_chain.clone(),
            destination_address: destination_address.clone(),
            token: self.wzec_token.clone(),
            amount: amount.0,
            created_at: env::block_timestamp(),
            status: WithdrawalStatus::Pending,
            intent_id: None,
        };

        self.pending_withdrawals.insert(&withdrawal_id, &withdrawal);
        self.total_withdrawals += 1;

        env::log_str(&format!(
            "Withdrawal initiated: {} wZEC from {} to {} on {}",
            amount.0, employee_id, destination_address, destination_chain.chain_id()
        ));

        withdrawal_id
    }

    /// Process pending withdrawal by creating intent
    /// Called after wZEC is transferred to this contract
    pub fn process_withdrawal(&mut self, withdrawal_id: String) -> Promise {
        let mut withdrawal = self.pending_withdrawals
            .get(&withdrawal_id)
            .expect("Withdrawal not found");

        assert_eq!(
            withdrawal.status,
            WithdrawalStatus::Pending,
            "Withdrawal already processed"
        );

        // For NEAR destination, direct transfer
        if withdrawal.destination_chain == DestinationChain::Near {
            return self.process_near_withdrawal(withdrawal_id, withdrawal);
        }

        // For cross-chain, create intent via ft_transfer_call to intents contract
        let intent_msg = self.build_intent_message(&withdrawal);

        withdrawal.status = WithdrawalStatus::IntentCreated;
        self.pending_withdrawals.insert(&withdrawal_id, &withdrawal);

        ext_ft::ext(self.wzec_token.clone())
            .with_static_gas(GAS_FOR_FT_TRANSFER_CALL)
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .ft_transfer_call(
                self.intents_contract.clone(),
                U128(withdrawal.amount),
                Some(format!("Cross-chain withdrawal {}", withdrawal_id)),
                intent_msg,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .on_intent_created(withdrawal_id)
            )
    }

    /// Process withdrawal to NEAR address (no bridging needed)
    fn process_near_withdrawal(&self, withdrawal_id: String, withdrawal: PendingWithdrawal) -> Promise {
        let recipient: AccountId = withdrawal.destination_address.parse()
            .expect("Invalid NEAR address");

        ext_ft::ext(self.wzec_token.clone())
            .with_static_gas(GAS_FOR_FT_TRANSFER)
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .ft_transfer(
                recipient,
                U128(withdrawal.amount),
                Some(format!("Payroll withdrawal {}", withdrawal_id)),
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .on_near_withdrawal_complete(withdrawal_id)
            )
    }

    /// Build intent message for cross-chain transfer
    fn build_intent_message(&self, withdrawal: &PendingWithdrawal) -> String {
        // Intent message format for NEAR Intents protocol
        // This tells the intents contract where to route the tokens
        serde_json::json!({
            "action": "cross_chain_transfer",
            "destination_chain": withdrawal.destination_chain.chain_id(),
            "destination_address": withdrawal.destination_address,
            "token": withdrawal.token.to_string(),
            "amount": withdrawal.amount.to_string(),
        }).to_string()
    }

    /// Callback after intent created
    #[private]
    pub fn on_intent_created(&mut self, withdrawal_id: String) {
        match env::promise_result(0) {
            PromiseResult::Successful(_) => {
                if let Some(mut withdrawal) = self.pending_withdrawals.get(&withdrawal_id) {
                    withdrawal.status = WithdrawalStatus::Processing;
                    self.pending_withdrawals.insert(&withdrawal_id, &withdrawal);

                    env::log_str(&format!(
                        "Intent created for withdrawal {}",
                        withdrawal_id
                    ));
                }
            }
            _ => {
                if let Some(mut withdrawal) = self.pending_withdrawals.get(&withdrawal_id) {
                    withdrawal.status = WithdrawalStatus::Failed;
                    self.pending_withdrawals.insert(&withdrawal_id, &withdrawal);

                    env::log_str(&format!(
                        "Intent creation failed for withdrawal {}",
                        withdrawal_id
                    ));
                }
            }
        }
    }

    /// Callback for NEAR withdrawal completion
    #[private]
    pub fn on_near_withdrawal_complete(&mut self, withdrawal_id: String) {
        match env::promise_result(0) {
            PromiseResult::Successful(_) => {
                if let Some(mut withdrawal) = self.pending_withdrawals.get(&withdrawal_id) {
                    withdrawal.status = WithdrawalStatus::Completed;
                    self.pending_withdrawals.insert(&withdrawal_id, &withdrawal);

                    env::log_str(&format!(
                        "NEAR withdrawal completed: {}",
                        withdrawal_id
                    ));
                }
            }
            _ => {
                if let Some(mut withdrawal) = self.pending_withdrawals.get(&withdrawal_id) {
                    withdrawal.status = WithdrawalStatus::Failed;
                    self.pending_withdrawals.insert(&withdrawal_id, &withdrawal);

                    env::log_str(&format!(
                        "NEAR withdrawal failed: {}",
                        withdrawal_id
                    ));
                }
            }
        }
    }

    /// Bridge relayer confirms cross-chain withdrawal completion
    pub fn confirm_withdrawal_complete(
        &mut self,
        withdrawal_id: String,
        destination_tx_hash: String,
    ) {
        self.assert_authorized_relayer();

        let mut withdrawal = self.pending_withdrawals
            .get(&withdrawal_id)
            .expect("Withdrawal not found");

        withdrawal.status = WithdrawalStatus::Completed;
        withdrawal.intent_id = Some(destination_tx_hash.clone());
        self.pending_withdrawals.insert(&withdrawal_id, &withdrawal);

        env::log_str(&format!(
            "Withdrawal {} completed on {} (tx: {})",
            withdrawal_id,
            withdrawal.destination_chain.chain_id(),
            destination_tx_hash
        ));
    }

    // ==================== ADMIN OPERATIONS ====================

    /// Add authorized bridge relayer
    pub fn add_relayer(&mut self, relayer: AccountId) {
        self.assert_owner();
        if !self.authorized_relayers.contains(&relayer) {
            self.authorized_relayers.push(relayer.clone());
            env::log_str(&format!("Relayer added: {}", relayer));
        }
    }

    /// Remove authorized bridge relayer
    pub fn remove_relayer(&mut self, relayer: AccountId) {
        self.assert_owner();
        self.authorized_relayers.retain(|r| r != &relayer);
        env::log_str(&format!("Relayer removed: {}", relayer));
    }

    /// Update chain configuration
    pub fn update_chain_config(&mut self, config: ChainConfig) {
        self.assert_owner();
        self.chain_configs.insert(&config.chain.chain_id().to_string(), &config);
        env::log_str(&format!("Chain config updated: {}", config.chain.chain_id()));
    }

    /// Add supported token
    pub fn add_supported_token(&mut self, token: AccountId) {
        self.assert_owner();
        self.supported_tokens.insert(&token, &true);
        env::log_str(&format!("Token added: {}", token));
    }

    /// Remove supported token
    pub fn remove_supported_token(&mut self, token: AccountId) {
        self.assert_owner();
        self.supported_tokens.insert(&token, &false);
        env::log_str(&format!("Token removed: {}", token));
    }

    /// Update payroll contract address
    pub fn update_payroll_contract(&mut self, payroll_contract: AccountId) {
        self.assert_owner();
        self.payroll_contract = payroll_contract.clone();
        env::log_str(&format!("Payroll contract updated: {}", payroll_contract));
    }

    /// Update intents contract address
    pub fn update_intents_contract(&mut self, intents_contract: AccountId) {
        self.assert_owner();
        self.intents_contract = intents_contract.clone();
        env::log_str(&format!("Intents contract updated: {}", intents_contract));
    }

    /// Transfer ownership
    pub fn transfer_ownership(&mut self, new_owner: AccountId) {
        self.assert_owner();
        self.owner = new_owner.clone();
        env::log_str(&format!("Ownership transferred to {}", new_owner));
    }

    // ==================== VIEW METHODS ====================

    /// Get pending deposit by tx hash
    pub fn get_pending_deposit(&self, source_tx_hash: String) -> Option<PendingDeposit> {
        self.pending_deposits.get(&source_tx_hash)
    }

    /// Get pending withdrawal by ID
    pub fn get_pending_withdrawal(&self, withdrawal_id: String) -> Option<PendingWithdrawal> {
        self.pending_withdrawals.get(&withdrawal_id)
    }

    /// Get chain configuration
    pub fn get_chain_config(&self, chain: DestinationChain) -> Option<ChainConfig> {
        self.chain_configs.get(&chain.chain_id().to_string())
    }

    /// Check if token is supported
    pub fn is_token_supported(&self, token: AccountId) -> bool {
        self.supported_tokens.get(&token).unwrap_or(false)
    }

    /// Get contract stats
    pub fn get_stats(&self) -> (u64, u64, u64) {
        (self.total_deposits, self.total_withdrawals, self.withdrawal_nonce)
    }

    /// Get owner
    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    /// Get payroll contract
    pub fn get_payroll_contract(&self) -> AccountId {
        self.payroll_contract.clone()
    }

    /// Get intents contract
    pub fn get_intents_contract(&self) -> AccountId {
        self.intents_contract.clone()
    }

    /// Get authorized relayers
    pub fn get_relayers(&self) -> Vec<AccountId> {
        self.authorized_relayers.clone()
    }

    // ==================== INTERNAL METHODS ====================

    fn assert_owner(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner,
            "Only owner can call this"
        );
    }

    fn assert_authorized_relayer(&self) {
        let caller = env::predecessor_account_id();
        assert!(
            self.authorized_relayers.contains(&caller) || caller == self.owner,
            "Not an authorized relayer"
        );
    }

    fn generate_withdrawal_id(&self, initiator: &AccountId) -> String {
        let mut hasher = Sha256::new();
        hasher.update(b"withdrawal:");
        hasher.update(initiator.as_bytes());
        hasher.update(self.withdrawal_nonce.to_le_bytes());
        hasher.update(env::block_timestamp().to_le_bytes());
        let result = hasher.finalize();
        hex::encode(&result[..16]) // Use first 16 bytes for shorter ID
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn get_context(predecessor: AccountId) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(predecessor);
        builder
    }

    #[test]
    fn test_new() {
        let owner: AccountId = "owner.near".parse().unwrap();
        let payroll: AccountId = "payroll.near".parse().unwrap();
        let wzec: AccountId = "wzec.near".parse().unwrap();

        let context = get_context(owner.clone());
        testing_env!(context.build());

        let contract = IntentsAdapter::new(owner.clone(), payroll.clone(), wzec.clone(), None);

        assert_eq!(contract.get_owner(), owner);
        assert_eq!(contract.get_payroll_contract(), payroll);
        assert!(contract.is_token_supported(wzec));
    }

    #[test]
    fn test_chain_address_validation() {
        // Zcash addresses
        assert!(DestinationChain::Zcash.validate_address("zs1234567890abcdef"));
        assert!(DestinationChain::Zcash.validate_address("t1abcdefgh12345"));
        assert!(!DestinationChain::Zcash.validate_address("invalid"));

        // Ethereum addresses
        assert!(DestinationChain::Ethereum.validate_address("0x1234567890123456789012345678901234567890"));
        assert!(!DestinationChain::Ethereum.validate_address("1234567890"));

        // NEAR addresses
        assert!(DestinationChain::Near.validate_address("alice.near"));
        assert!(DestinationChain::Near.validate_address("bob.testnet"));
    }

    #[test]
    fn test_chain_config() {
        let owner: AccountId = "owner.near".parse().unwrap();
        let payroll: AccountId = "payroll.near".parse().unwrap();
        let wzec: AccountId = "wzec.near".parse().unwrap();

        let context = get_context(owner.clone());
        testing_env!(context.build());

        let contract = IntentsAdapter::new(owner, payroll, wzec, None);

        // Check Zcash config exists
        let zcash_config = contract.get_chain_config(DestinationChain::Zcash);
        assert!(zcash_config.is_some());
        let config = zcash_config.unwrap();
        assert!(config.deposit_enabled);
        assert!(config.withdrawal_enabled);
    }
}
