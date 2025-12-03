//! # Private Payroll Contract for NEAR Protocol
//!
//! A privacy-preserving payroll system that uses ZK proofs for:
//! - Private salary payments (amounts hidden via commitments)
//! - Income verification without revealing actual amounts
//! - Selective disclosure to third parties (banks, landlords)
//!
//! ## Architecture
//! - wZEC tokens for value transfer (bridged from Zcash)
//! - RISC Zero for ZK proof generation/verification (TRUSTLESS)
//! - Pedersen commitments for amount privacy
//!
//! ## Key Design Decision: Trustless Architecture
//! Unlike systems that require trusted auditors, this contract verifies
//! RISC Zero STARK proofs directly on-chain. No middleman needed for
//! income proof verification.

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::{LookupMap, UnorderedMap, Vector};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, ext_contract, near_bindgen, AccountId, BorshStorageKey, Gas, NearSchema, NearToken, PanicOnDefault, Promise, PromiseOrValue, PromiseError};
use sha2::{Digest, Sha256};

/// Gas constants for cross-contract calls
const GAS_FOR_VERIFY: Gas = Gas::from_tgas(50);
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(30);

// ==================== EXTERNAL INTERFACES ====================

/// Supported destination chains for cross-chain withdrawals
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq, Debug, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub enum DestinationChain {
    /// Zcash mainnet (shielded recommended for privacy)
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

/// Withdrawal route selection for cross-chain operations
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq, Debug, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub enum WithdrawalRoute {
    /// Private bridge: Uses wZEC + custom bridge relayer
    /// - Full privacy (Zallet wallet with shielded transactions)
    /// - Any withdrawal amount
    /// - Currently supports Zcash only
    PrivateBridge,

    /// NEAR Intents: Uses PoA Bridge tokens (e.g., zec.omft.near)
    /// - Multi-chain support (Zcash, Solana, Ethereum, Bitcoin)
    /// - Minimum amounts enforced by PoA Bridge (1.0 ZEC for Zcash)
    /// - Mainnet only (not available on testnet)
    NearIntents,
}

/// External interface for wZEC Token contract (custom bridge)
#[ext_contract(ext_wzec)]
pub trait ExtWzecToken {
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> Promise;
}

/// External interface for PoA Bridge tokens (e.g., zec.omft.near)
#[ext_contract(ext_poa_token)]
pub trait ExtPoAToken {
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> Promise;
}

/// External interface for NEAR Intents contract (intents.near)
#[ext_contract(ext_near_intents)]
pub trait ExtNearIntents {
    // NEAR Intents uses ft_on_transfer callback pattern
    // No direct methods needed - interactions via ft_transfer_call
}

/// External interface for Intents Adapter contract
#[ext_contract(ext_intents_adapter)]
pub trait ExtIntentsAdapter {
    fn initiate_withdrawal(
        &mut self,
        employee_id: AccountId,
        destination_chain: DestinationChain,
        destination_address: String,
        amount: U128,
    ) -> String;
}

/// External interface for zk-verifier contract
#[ext_contract(ext_zk_verifier)]
pub trait ExtZkVerifier {
    fn verify_income_threshold(
        &mut self,
        receipt: Vec<u8>,
        expected_threshold: u64,
        expected_commitment: [u8; 32],
    ) -> IncomeThresholdOutput;

    fn verify_income_range(
        &mut self,
        receipt: Vec<u8>,
        expected_min: u64,
        expected_max: u64,
        expected_commitment: [u8; 32],
    ) -> IncomeRangeOutput;

    fn verify_credit_score(
        &mut self,
        receipt: Vec<u8>,
        expected_threshold: u32,
        expected_commitment: [u8; 32],
    ) -> CreditScoreOutput;
}

/// Output from income threshold verification
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct IncomeThresholdOutput {
    pub threshold: u64,
    pub meets_threshold: bool,
    pub payment_count: u32,
    pub history_commitment: [u8; 32],
    pub verified: bool,
}

/// Output from income range verification
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct IncomeRangeOutput {
    pub min: u64,
    pub max: u64,
    pub in_range: bool,
    pub payment_count: u32,
    pub history_commitment: [u8; 32],
    pub verified: bool,
}

/// Output from credit score verification
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct CreditScoreOutput {
    pub threshold: u32,
    pub meets_threshold: bool,
    pub payment_count: u32,
    pub history_commitment: [u8; 32],
    pub verified: bool,
}

/// Storage keys for collections
#[derive(BorshStorageKey, BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
pub enum StorageKey {
    Employees,
    SalaryCommitments,
    PaymentHistory,
    PaymentHistoryInner { employee_id: AccountId },
    EmployeeBalances,
    Disclosures,
    DisclosuresInner { employee_id: AccountId },
    /// Income proofs per employee (trustless - verified via RISC Zero)
    EmployeeIncomeProofs,
    /// Used proof receipts (replay protection)
    UsedReceipts,
    /// Authorized auditors (only for FullAudit disclosure, not for income proofs)
    AuthorizedAuditors,
    /// Pending proofs awaiting verification callback
    PendingProofs,
    /// Auto-lend configurations per employee
    AutoLendConfigs,
    /// Lent balances per employee
    LentBalances,
}

/// Pending proof data (stored while waiting for zk-verifier callback)
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct PendingProof {
    /// Employee who submitted
    pub employee_id: AccountId,
    /// Type of proof
    pub proof_type: IncomeProofType,
    /// Threshold (for threshold proofs)
    pub threshold: Option<u64>,
    /// Range min (for range proofs)
    pub range_min: Option<u64>,
    /// Range max (for range proofs)
    pub range_max: Option<u64>,
    /// History commitment
    pub history_commitment: [u8; 32],
    /// Receipt hash
    pub receipt_hash: [u8; 32],
    /// Expiration days
    pub expires_in_days: u32,
    /// Submission timestamp
    pub submitted_at: u64,
}

/// Employment status
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq, Debug, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub enum EmploymentStatus {
    Active,
    OnLeave,
    Terminated,
}

/// Employee data (sensitive fields encrypted)
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct Employee {
    /// Employee's NEAR account
    pub account_id: AccountId,
    /// Encrypted name (company can decrypt)
    pub encrypted_name: Vec<u8>,
    /// Encrypted salary amount (employee can decrypt)
    pub encrypted_salary: Vec<u8>,
    /// Employment status
    pub status: EmploymentStatus,
    /// Start timestamp (nanoseconds)
    pub start_date: u64,
    /// Employee's public key for encryption
    pub employee_public_key: Vec<u8>,
}

/// Encrypted payment record
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct EncryptedPayment {
    /// Timestamp of payment
    pub timestamp: u64,
    /// Encrypted amount (employee decrypts locally for ZK proofs)
    pub encrypted_amount: Vec<u8>,
    /// Pedersen commitment to amount (for ZK verification)
    pub commitment: [u8; 32],
    /// Payment period (e.g., "2024-01" for January 2024)
    pub period: String,
}

/// Disclosure authorization for third parties
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct Disclosure {
    /// Who can verify
    pub verifier: AccountId,
    /// Type of disclosure
    pub disclosure_type: DisclosureType,
    /// Expiration timestamp
    pub expires_at: u64,
    /// Is active
    pub active: bool,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub enum DisclosureType {
    /// Prove income above threshold
    IncomeAboveThreshold { threshold: U128 },
    /// Prove income in range
    IncomeRange { min: U128, max: U128 },
    /// Prove employment status
    EmploymentStatus,
    /// Full audit access (rare)
    FullAudit,
}

/// Income proof types (matching RISC Zero circuits)
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq, Debug, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub enum IncomeProofType {
    /// Income >= threshold
    AboveThreshold,
    /// min <= Income <= max
    InRange,
    /// Average income >= threshold
    AverageAboveThreshold,
    /// Credit score >= threshold
    CreditScore,
}

/// Verified income proof record (TRUSTLESS - verified via RISC Zero on-chain)
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct VerifiedIncomeProof {
    /// Type of proof
    pub proof_type: IncomeProofType,
    /// Threshold value (for AboveThreshold, AverageAboveThreshold)
    pub threshold: Option<u64>,
    /// Range min (for InRange)
    pub range_min: Option<u64>,
    /// Range max (for InRange)
    pub range_max: Option<u64>,
    /// Result of the proof (true = meets requirement)
    pub result: bool,
    /// Number of payment periods included in proof
    pub payment_count: u32,
    /// History commitment (binds proof to on-chain data)
    pub history_commitment: [u8; 32],
    /// Receipt hash (for reference/replay protection)
    pub receipt_hash: [u8; 32],
    /// Verification timestamp
    pub verified_at: u64,
    /// Expiration timestamp
    pub expires_at: u64,
}

/// Authorized auditor (for FullAudit disclosure only, NOT for income proofs)
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct AuthorizedAuditor {
    /// Auditor account
    pub account_id: AccountId,
    /// License/credential info
    pub license_info: String,
    /// Registration timestamp
    pub registered_at: u64,
    /// Is active
    pub active: bool,
}

/// Auto-lend configuration for an employee
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct AutoLendConfig {
    /// Whether auto-lend is enabled
    pub enabled: bool,
    /// Percentage of salary to auto-lend (0-100)
    pub percentage: u8,
    /// Target lending protocol (e.g., "aave", "compound", "solend")
    pub target_protocol: String,
    /// Target chain for lending
    pub target_chain: DestinationChain,
    /// Asset to lend as (e.g., "nep141:usdc.token.near")
    pub target_asset: String,
}

/// Main payroll contract
#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
#[borsh(crate = "near_sdk::borsh")]
pub struct PayrollContract {
    /// Company owner
    pub owner: AccountId,
    /// wZEC token contract address (custom bridge)
    pub wzec_token: AccountId,
    /// PoA Bridge token contract address (e.g., zec.omft.near for NEAR Intents)
    pub poa_token: Option<AccountId>,
    /// NEAR Intents contract address (intents.near on mainnet)
    pub near_intents_contract: Option<AccountId>,
    /// ZK verifier contract address
    pub zk_verifier: AccountId,
    /// Intents adapter contract address (for private bridge cross-chain operations)
    pub intents_adapter: Option<AccountId>,
    /// Company's public key for encrypting employee names (company can decrypt locally)
    pub company_public_key: Vec<u8>,

    /// Employee records
    pub employees: UnorderedMap<AccountId, Employee>,
    /// Salary commitments (Pedersen commitments)
    pub salary_commitments: LookupMap<AccountId, [u8; 32]>,
    /// Payment history per employee
    pub payment_history: LookupMap<AccountId, Vector<EncryptedPayment>>,
    /// Employee balances (withdrawable)
    pub employee_balances: LookupMap<AccountId, u128>,

    /// Disclosure authorizations
    pub disclosures: LookupMap<AccountId, Vector<Disclosure>>,

    /// Income proofs per employee (TRUSTLESS - verified via RISC Zero)
    /// Each employee can have one active proof per type
    pub employee_income_proofs: LookupMap<AccountId, Vec<VerifiedIncomeProof>>,
    /// Used receipt hashes (replay protection)
    pub used_receipts: LookupMap<[u8; 32], bool>,
    /// Authorized auditors (ONLY for FullAudit disclosure, NOT for income proofs)
    pub authorized_auditors: UnorderedMap<AccountId, AuthorizedAuditor>,
    /// Pending proofs (awaiting zk-verifier callback)
    pub pending_proofs: LookupMap<[u8; 32], PendingProof>,

    /// Auto-lend configurations per employee
    pub auto_lend_configs: LookupMap<AccountId, AutoLendConfig>,
    /// Lent balances per employee (funds in lending protocols)
    pub lent_balances: LookupMap<AccountId, u128>,

    /// Company balance (deposited wZEC)
    pub company_balance: u128,
    /// Total employees
    pub total_employees: u32,
    /// Total payments made
    pub total_payments: u64,
}

#[near_bindgen]
impl PayrollContract {
    /// Initialize the contract
    #[init]
    pub fn new(owner: AccountId, wzec_token: AccountId, zk_verifier: AccountId, company_public_key: Vec<u8>) -> Self {
        Self {
            owner,
            wzec_token,
            poa_token: None,
            near_intents_contract: None,
            zk_verifier,
            intents_adapter: None,
            company_public_key,
            employees: UnorderedMap::new(StorageKey::Employees),
            salary_commitments: LookupMap::new(StorageKey::SalaryCommitments),
            payment_history: LookupMap::new(StorageKey::PaymentHistory),
            employee_balances: LookupMap::new(StorageKey::EmployeeBalances),
            disclosures: LookupMap::new(StorageKey::Disclosures),
            employee_income_proofs: LookupMap::new(StorageKey::EmployeeIncomeProofs),
            used_receipts: LookupMap::new(StorageKey::UsedReceipts),
            authorized_auditors: UnorderedMap::new(StorageKey::AuthorizedAuditors),
            pending_proofs: LookupMap::new(StorageKey::PendingProofs),
            auto_lend_configs: LookupMap::new(StorageKey::AutoLendConfigs),
            lent_balances: LookupMap::new(StorageKey::LentBalances),
            company_balance: 0,
            total_employees: 0,
            total_payments: 0,
        }
    }

    /// Set the intents adapter contract (owner only)
    /// Used for private bridge cross-chain operations
    pub fn set_intents_adapter(&mut self, intents_adapter: AccountId) {
        self.assert_owner();
        self.intents_adapter = Some(intents_adapter.clone());
        env::log_str(&format!("Intents adapter set to {}", intents_adapter));
    }

    /// Get the intents adapter contract
    pub fn get_intents_adapter(&self) -> Option<AccountId> {
        self.intents_adapter.clone()
    }

    /// Set the PoA Bridge token contract (owner only)
    /// e.g., zec.omft.near for Zcash via NEAR Intents
    pub fn set_poa_token(&mut self, poa_token: AccountId) {
        self.assert_owner();
        self.poa_token = Some(poa_token.clone());
        env::log_str(&format!("PoA Bridge token set to {}", poa_token));
    }

    /// Get the PoA Bridge token contract
    pub fn get_poa_token(&self) -> Option<AccountId> {
        self.poa_token.clone()
    }

    /// Set the NEAR Intents contract (owner only)
    /// Should be "intents.near" on mainnet
    pub fn set_near_intents_contract(&mut self, near_intents: AccountId) {
        self.assert_owner();
        self.near_intents_contract = Some(near_intents.clone());
        env::log_str(&format!("NEAR Intents contract set to {}", near_intents));
    }

    /// Get the NEAR Intents contract
    pub fn get_near_intents_contract(&self) -> Option<AccountId> {
        self.near_intents_contract.clone()
    }

    // ==================== COMPANY OPERATIONS ====================

    /// Company deposits wZEC for payroll
    /// Called via ft_transfer_call from wZEC contract
    ///
    /// Accepts deposits from:
    /// - Owner (direct deposit)
    /// - Intents adapter (cross-chain deposits forwarded from companies)
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let token_contract = env::predecessor_account_id();
        assert_eq!(token_contract, self.wzec_token, "Only wZEC accepted");

        // Accept deposits from owner or intents adapter
        let is_valid_sender = sender_id == self.owner
            || self.intents_adapter.as_ref().map_or(false, |adapter| &sender_id == adapter);

        if msg == "deposit" && is_valid_sender {
            self.company_balance += amount.0;
            env::log_str(&format!(
                "Company deposited {} wZEC (via {})",
                amount.0,
                sender_id
            ));
            PromiseOrValue::Value(U128(0)) // Accept all tokens
        } else {
            // Refund if not a valid deposit
            env::log_str(&format!(
                "Deposit rejected: sender={}, msg='{}', valid_sender={}",
                sender_id, msg, is_valid_sender
            ));
            PromiseOrValue::Value(amount)
        }
    }

    /// Add a new employee
    #[payable]
    pub fn add_employee(
        &mut self,
        employee_id: AccountId,
        encrypted_name: Vec<u8>,
        encrypted_salary: Vec<u8>,
        salary_commitment: [u8; 32],
        employee_public_key: Vec<u8>,
    ) {
        self.assert_owner();
        assert!(
            self.employees.get(&employee_id).is_none(),
            "Employee already exists"
        );

        let employee = Employee {
            account_id: employee_id.clone(),
            encrypted_name,
            encrypted_salary,
            status: EmploymentStatus::Active,
            start_date: env::block_timestamp(),
            employee_public_key,
        };

        self.employees.insert(&employee_id, &employee);
        self.salary_commitments.insert(&employee_id, &salary_commitment);
        self.employee_balances.insert(&employee_id, &0u128);

        // Initialize empty payment history
        let history_key = StorageKey::PaymentHistoryInner {
            employee_id: employee_id.clone(),
        };
        self.payment_history
            .insert(&employee_id, &Vector::new(history_key));

        self.total_employees += 1;

        env::log_str(&format!("Employee {} added", employee_id));
    }

    /// Pay an employee with ZK proof that payment matches committed salary
    #[payable]
    pub fn pay_employee(
        &mut self,
        employee_id: AccountId,
        encrypted_amount: Vec<u8>,
        payment_commitment: [u8; 32],
        period: String,
        zk_proof: Vec<u8>,
    ) {
        self.assert_owner();

        let employee = self
            .employees
            .get(&employee_id)
            .expect("Employee not found");
        assert_eq!(
            employee.status,
            EmploymentStatus::Active,
            "Employee not active"
        );

        // Get salary commitment
        let salary_commitment = self
            .salary_commitments
            .get(&employee_id)
            .expect("Salary commitment not found");

        // Verify ZK proof that payment matches salary
        // In production, this calls the zk-verifier contract
        self.verify_payment_proof(&zk_proof, &salary_commitment, &payment_commitment);

        // For now, we trust the commitment represents the correct amount
        // The actual amount is hidden - we just track the commitment
        let payment = EncryptedPayment {
            timestamp: env::block_timestamp(),
            encrypted_amount,
            commitment: payment_commitment,
            period,
        };

        // Add to payment history
        let mut history = self
            .payment_history
            .get(&employee_id)
            .expect("Payment history not found");
        history.push(&payment);
        self.payment_history.insert(&employee_id, &history);

        // Update employee balance (amount extracted from proof)
        // Note: In real implementation, amount comes from verified proof output
        let current_balance = self.employee_balances.get(&employee_id).unwrap_or(0);
        // Amount would be verified via ZK proof - placeholder for now
        let payment_amount = self.extract_amount_from_proof(&zk_proof);

        // Check if auto-lending is enabled
        let auto_lend_config = self.auto_lend_configs.get(&employee_id);
        let (to_lend, to_balance, lend_percentage) = if let Some(ref config) = auto_lend_config {
            if config.enabled && config.percentage > 0 {
                let lend_amount = (payment_amount * config.percentage as u128) / 100;
                let balance_amount = payment_amount - lend_amount;
                (lend_amount, balance_amount, config.percentage)
            } else {
                (0, payment_amount, 0)
            }
        } else {
            (0, payment_amount, 0)
        };

        // Update balances
        self.employee_balances
            .insert(&employee_id, &(current_balance + to_balance));

        if to_lend > 0 {
            let current_lent = self.lent_balances.get(&employee_id).unwrap_or(0);
            self.lent_balances.insert(&employee_id, &(current_lent + to_lend));

            env::log_str(&format!(
                "Auto-lend: {} ZEC moved to lending ({}% of payment)",
                to_lend,
                lend_percentage
            ));
        }

        // Deduct from company balance
        assert!(
            self.company_balance >= payment_amount,
            "Insufficient company balance"
        );
        self.company_balance -= payment_amount;

        self.total_payments += 1;

        env::log_str(&format!(
            "Payment processed for {} (period: {}): {} to balance, {} auto-lent",
            employee_id, payment.period, to_balance, to_lend
        ));
    }

    /// Update employee status
    pub fn update_employee_status(&mut self, employee_id: AccountId, status: EmploymentStatus) {
        self.assert_owner();

        let mut employee = self
            .employees
            .get(&employee_id)
            .expect("Employee not found");
        employee.status = status.clone();
        self.employees.insert(&employee_id, &employee);

        env::log_str(&format!("Employee {} status updated to {:?}", employee_id, status));
    }

    // ==================== EMPLOYEE OPERATIONS ====================

    /// Employee withdraws their balance to their NEAR wallet
    pub fn withdraw(&mut self, amount: U128) -> Promise {
        let employee_id = env::predecessor_account_id();

        let balance = self
            .employee_balances
            .get(&employee_id)
            .expect("Not an employee");
        assert!(balance >= amount.0, "Insufficient balance");

        self.employee_balances
            .insert(&employee_id, &(balance - amount.0));

        // Transfer wZEC to employee
        self.transfer_wzec(employee_id, amount)
    }

    /// Employee withdraws their balance via cross-chain intents
    /// Supports two withdrawal routes:
    /// 1. PrivateBridge - Custom bridge with full privacy (Zcash only, any amount)
    /// 2. NearIntents - PoA Bridge multi-chain (mainnet only, minimum amounts apply)
    ///
    /// # Arguments
    /// * `amount` - Amount to withdraw (8 decimals)
    /// * `destination_chain` - Target blockchain for withdrawal
    /// * `destination_address` - Address on target chain (e.g., Zcash shielded address)
    /// * `route` - Withdrawal route (PrivateBridge or NearIntents)
    ///
    /// # Example
    /// ```ignore
    /// // Private bridge withdrawal (max privacy)
    /// withdraw_via_intents(
    ///     U128(50_000_000), // 0.5 ZEC
    ///     DestinationChain::Zcash,
    ///     "zs1...",
    ///     WithdrawalRoute::PrivateBridge
    /// )
    ///
    /// // NEAR Intents withdrawal (multi-chain, mainnet only)
    /// withdraw_via_intents(
    ///     U128(100_000_000), // 1.0 ZEC (minimum for PoA Bridge)
    ///     DestinationChain::Zcash,
    ///     "zs1...",
    ///     WithdrawalRoute::NearIntents
    /// )
    /// ```
    pub fn withdraw_via_intents(
        &mut self,
        amount: U128,
        destination_chain: DestinationChain,
        destination_address: String,
        route: WithdrawalRoute,
    ) -> Promise {
        let employee_id = env::predecessor_account_id();

        // Verify employee exists and has sufficient balance
        let balance = self
            .employee_balances
            .get(&employee_id)
            .expect("Not an employee");
        assert!(balance >= amount.0, "Insufficient balance");

        // Deduct balance
        self.employee_balances
            .insert(&employee_id, &(balance - amount.0));

        env::log_str(&format!(
            "Initiating cross-chain withdrawal via {:?}: {} from {} to {} on {:?}",
            route, amount.0, employee_id, destination_address, destination_chain
        ));

        match route {
            WithdrawalRoute::PrivateBridge => {
                // Route via custom bridge + intents adapter
                // Uses wZEC token
                let intents_adapter = self.intents_adapter
                    .as_ref()
                    .expect("Intents adapter not configured for PrivateBridge");

                // Build withdrawal message: "withdrawal:chain:destination_address"
                let chain_str = match destination_chain {
                    DestinationChain::Zcash => "zcash",
                    DestinationChain::Solana => "solana",
                    DestinationChain::Ethereum => "ethereum",
                    DestinationChain::Bitcoin => "bitcoin",
                    DestinationChain::Near => "near",
                };
                let withdrawal_msg = format!("withdrawal:{}:{}", chain_str, destination_address);

                // Transfer wZEC to intents adapter
                ext_wzec::ext(self.wzec_token.clone())
                    .with_static_gas(Gas::from_tgas(100))
                    .with_attached_deposit(NearToken::from_yoctonear(1))
                    .ft_transfer_call(
                        intents_adapter.clone(),
                        amount,
                        Some(format!("Employee withdrawal for {}", employee_id)),
                        withdrawal_msg,
                    )
            }

            WithdrawalRoute::NearIntents => {
                // Route via NEAR Intents (intents.near)
                // Uses PoA Bridge token (e.g., zec.omft.near)
                let poa_token = self.poa_token
                    .as_ref()
                    .expect("PoA Bridge token not configured for NearIntents");

                let near_intents = self.near_intents_contract
                    .as_ref()
                    .expect("NEAR Intents contract not configured");

                // For NEAR Intents, the msg is empty (as per reference implementation)
                // The destination address/chain info is handled by the Intents SDK off-chain
                ext_poa_token::ext(poa_token.clone())
                    .with_static_gas(Gas::from_tgas(100))
                    .with_attached_deposit(NearToken::from_yoctonear(1))
                    .ft_transfer_call(
                        near_intents.clone(),
                        amount,
                        Some(format!("Employee withdrawal via NEAR Intents for {}", employee_id)),
                        String::new(), // Empty msg per NEAR Intents protocol
                    )
            }
        }
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(20))
                    .on_withdrawal_initiated(employee_id, amount)
            )
    }

    /// Callback after cross-chain withdrawal initiated
    #[private]
    pub fn on_withdrawal_initiated(
        &mut self,
        employee_id: AccountId,
        amount: U128,
    ) -> String {
        match env::promise_result(0) {
            near_sdk::PromiseResult::Successful(result) => {
                // ft_transfer_call returns the refunded amount
                let refund: U128 = serde_json::from_slice(&result).unwrap_or(U128(0));

                if refund.0 > 0 {
                    // Withdrawal was rejected or partially refunded, credit back to employee
                    let balance = self.employee_balances.get(&employee_id).unwrap_or(0);
                    self.employee_balances.insert(&employee_id, &(balance + refund.0));

                    if refund.0 == amount.0 {
                        env::log_str(&format!(
                            "Cross-chain withdrawal rejected for {}, refunded {} wZEC",
                            employee_id, refund.0
                        ));
                        return "rejected".to_string();
                    } else {
                        env::log_str(&format!(
                            "Cross-chain withdrawal partially refunded for {}: {} wZEC",
                            employee_id, refund.0
                        ));
                    }
                }

                env::log_str(&format!(
                    "Cross-chain withdrawal initiated for {}: {} wZEC (net: {})",
                    employee_id, amount.0, amount.0 - refund.0
                ));

                "success".to_string()
            }
            _ => {
                // Transfer call failed completely, refund full amount
                let balance = self.employee_balances.get(&employee_id).unwrap_or(0);
                self.employee_balances.insert(&employee_id, &(balance + amount.0));

                env::log_str(&format!(
                    "Cross-chain withdrawal failed for {}, refunded {} wZEC",
                    employee_id, amount.0
                ));

                "failed".to_string()
            }
        }
    }

    // ==================== DEFI OPERATIONS ====================

    /// Employee swaps their ZEC balance to another token on any chain
    /// Powered by NEAR Intents - enables spending ZEC across DeFi ecosystems
    ///
    /// # Use Cases
    /// - Swap ZEC salary to USDC on Solana for daily expenses
    /// - Convert ZEC to ETH on Ethereum for gas fees
    /// - Exchange ZEC to SOL for Solana DeFi participation
    ///
    /// # Arguments
    /// * `amount` - Amount of ZEC balance to swap (8 decimals)
    /// * `target_asset` - Target token (e.g., "nep141:usdc.token.near")
    /// * `target_chain` - Destination blockchain
    /// * `min_output` - Minimum acceptable output amount (slippage protection)
    /// * `recipient` - Optional recipient address on target chain (defaults to employee)
    ///
    /// # Example
    /// ```ignore
    /// // Swap 1 ZEC to USDC on Solana
    /// swap_balance(
    ///     U128(100_000_000), // 1 ZEC
    ///     "nep141:usdc.token.near".to_string(),
    ///     DestinationChain::Solana,
    ///     U128(2800_000_000), // Min 2800 USDC (assuming ~$2900/ZEC)
    ///     Some("SolanaAddress123...".to_string())
    /// )
    /// ```
    pub fn swap_balance(
        &mut self,
        amount: U128,
        target_asset: String,
        target_chain: DestinationChain,
        min_output: U128,
        recipient: Option<String>,
    ) -> Promise {
        let employee_id = env::predecessor_account_id();

        // Verify employee exists and has sufficient balance
        let balance = self
            .employee_balances
            .get(&employee_id)
            .expect("Not an employee");
        assert!(balance >= amount.0, "Insufficient balance");

        // Verify NEAR Intents is configured
        let near_intents = self.near_intents_contract
            .as_ref()
            .expect("NEAR Intents not configured - swaps unavailable");

        // Verify PoA token is configured (needed for swaps via Intents)
        let poa_token = self.poa_token
            .as_ref()
            .expect("PoA Bridge token not configured");

        // Deduct balance
        self.employee_balances
            .insert(&employee_id, &(balance - amount.0));

        env::log_str(&format!(
            "Initiating cross-chain swap: {} ZEC → {} on {:?} for {}",
            amount.0, target_asset, target_chain, employee_id
        ));

        // For NEAR Intents swaps, we need to:
        // 1. Transfer PoA token (zec.omft.near) to intents.near
        // 2. Intents SDK (off-chain) handles the actual swap intent
        // 3. User receives target token on target chain
        //
        // Note: The swap parameters (target_asset, min_output, recipient)
        // are handled by the Intents SDK off-chain via signed intent message
        // The on-chain call just transfers the source token to intents.near

        let recipient_addr = recipient.unwrap_or_else(|| employee_id.to_string());

        ext_poa_token::ext(poa_token.clone())
            .with_static_gas(Gas::from_tgas(100))
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .ft_transfer_call(
                near_intents.clone(),
                amount,
                Some(format!("Swap ZEC to {} for {}", target_asset, employee_id)),
                String::new(), // Empty msg - swap details in off-chain intent
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(20))
                    .on_swap_initiated(employee_id, amount, target_asset, min_output)
            )
    }

    /// Callback after cross-chain swap initiated
    #[private]
    pub fn on_swap_initiated(
        &mut self,
        employee_id: AccountId,
        amount: U128,
        target_asset: String,
        min_output: U128,
    ) -> String {
        match env::promise_result(0) {
            near_sdk::PromiseResult::Successful(result) => {
                // ft_transfer_call returns the refunded amount
                let refund: U128 = serde_json::from_slice(&result).unwrap_or(U128(0));

                if refund.0 > 0 {
                    // Swap was rejected or partially refunded, credit back to employee
                    let balance = self.employee_balances.get(&employee_id).unwrap_or(0);
                    self.employee_balances.insert(&employee_id, &(balance + refund.0));

                    if refund.0 == amount.0 {
                        env::log_str(&format!(
                            "Swap rejected for {}, refunded {} ZEC",
                            employee_id, refund.0
                        ));
                        return "rejected".to_string();
                    } else {
                        env::log_str(&format!(
                            "Swap partially completed for {}, refunded {} ZEC",
                            employee_id, refund.0
                        ));
                        return "partial".to_string();
                    }
                }

                env::log_str(&format!(
                    "Swap initiated successfully: {} ZEC → {} (min {})",
                    amount.0, target_asset, min_output.0
                ));
                "success".to_string()
            }
            _ => {
                // Transfer call failed completely, refund full amount
                let balance = self.employee_balances.get(&employee_id).unwrap_or(0);
                self.employee_balances.insert(&employee_id, &(balance + amount.0));

                env::log_str(&format!(
                    "Swap failed for {}, refunded {} ZEC",
                    employee_id, amount.0
                ));

                "failed".to_string()
            }
        }
    }

    // ==================== AUTO-LEND OPERATIONS ====================

    /// Employee configures auto-lending of salary
    /// Automatically deposits a percentage of each payment into lending protocols
    pub fn enable_auto_lend(
        &mut self,
        percentage: u8,
        target_protocol: String,
        target_chain: DestinationChain,
        target_asset: String,
    ) {
        let employee_id = env::predecessor_account_id();
        assert!(
            self.employees.get(&employee_id).is_some(),
            "Not an employee"
        );
        assert!(percentage > 0 && percentage <= 100, "Invalid percentage (must be 1-100)");

        let config = AutoLendConfig {
            enabled: true,
            percentage,
            target_protocol,
            target_chain,
            target_asset,
        };

        self.auto_lend_configs.insert(&employee_id, &config);

        env::log_str(&format!(
            "Auto-lend enabled for {}: {}% to lending",
            employee_id, percentage
        ));
    }

    /// Employee disables auto-lending
    pub fn disable_auto_lend(&mut self) {
        let employee_id = env::predecessor_account_id();
        assert!(
            self.employees.get(&employee_id).is_some(),
            "Not an employee"
        );

        if let Some(mut config) = self.auto_lend_configs.get(&employee_id) {
            config.enabled = false;
            self.auto_lend_configs.insert(&employee_id, &config);
            env::log_str(&format!("Auto-lend disabled for {}", employee_id));
        }
    }

    /// Get auto-lend configuration for employee
    pub fn get_auto_lend_config(&self, employee_id: AccountId) -> Option<AutoLendConfig> {
        self.auto_lend_configs.get(&employee_id)
    }

    /// Get lent balance (funds currently in lending protocols)
    pub fn get_lent_balance(&self, employee_id: AccountId) -> U128 {
        U128(self.lent_balances.get(&employee_id).unwrap_or(0))
    }

    /// Employee withdraws funds from lending protocol
    /// This triggers a cross-chain operation to withdraw from the lending pool
    pub fn withdraw_lent_funds(
        &mut self,
        amount: U128,
    ) -> Promise {
        let employee_id = env::predecessor_account_id();

        let lent_balance = self.lent_balances.get(&employee_id).unwrap_or(0);
        assert!(lent_balance >= amount.0, "Insufficient lent balance");

        let config = self
            .auto_lend_configs
            .get(&employee_id)
            .expect("No auto-lend configuration found");

        // Verify NEAR Intents is configured
        let near_intents = self
            .near_intents_contract
            .as_ref()
            .expect("NEAR Intents not configured");
        let poa_token = self.poa_token.as_ref().expect("PoA Bridge token not configured");

        // Deduct from lent balance
        self.lent_balances.insert(&employee_id, &(lent_balance - amount.0));

        env::log_str(&format!(
            "Initiating withdrawal of {} ZEC from {} on {:?}",
            amount.0, config.target_protocol, config.target_chain
        ));

        // In a full implementation, this would:
        // 1. Call NEAR Intents to execute withdrawal from lending protocol
        // 2. Swap back to ZEC if needed
        // 3. Credit employee balance
        //
        // For now, we transfer directly to demonstrate the flow
        ext_poa_token::ext(poa_token.clone())
            .ft_transfer_call(
                near_intents.clone(),
                amount,
                Some(format!("Withdraw {} ZEC from lending for {}", amount.0, employee_id)),
                String::new(), // Withdrawal intent handled by NEAR Intents SDK
            )
            .then(
                Self::ext(env::current_account_id())
                    .on_lend_withdrawal(employee_id, amount)
            )
    }

    /// Callback after withdrawal attempt
    #[private]
    pub fn on_lend_withdrawal(&mut self, employee_id: AccountId, amount: U128) -> String {
        match env::promise_result(0) {
            near_sdk::PromiseResult::Successful(result) => {
                let refund: U128 = serde_json::from_slice(&result).unwrap_or(U128(0));

                if refund.0 > 0 {
                    // Withdrawal failed or partially failed, restore lent balance
                    let lent_balance = self.lent_balances.get(&employee_id).unwrap_or(0);
                    self.lent_balances.insert(&employee_id, &(lent_balance + refund.0));
                }

                // Credit available balance (amount - refund)
                let withdrawn = amount.0 - refund.0;
                if withdrawn > 0 {
                    let balance = self.employee_balances.get(&employee_id).unwrap_or(0);
                    self.employee_balances.insert(&employee_id, &(balance + withdrawn));
                    env::log_str(&format!(
                        "Lent funds withdrawn for {}: {} ZEC now available",
                        employee_id, withdrawn
                    ));
                }

                "success".to_string()
            }
            _ => {
                // Withdrawal failed, restore lent balance
                let lent_balance = self.lent_balances.get(&employee_id).unwrap_or(0);
                self.lent_balances.insert(&employee_id, &(lent_balance + amount.0));

                env::log_str(&format!(
                    "Lend withdrawal failed for {}, balance restored",
                    employee_id
                ));

                "failed".to_string()
            }
        }
    }

    // ==================== DISCLOSURE OPERATIONS ====================

    /// Employee grants disclosure to a third party
    pub fn grant_disclosure(
        &mut self,
        verifier: AccountId,
        disclosure_type: DisclosureType,
        duration_days: u32,
    ) {
        let employee_id = env::predecessor_account_id();
        assert!(
            self.employees.get(&employee_id).is_some(),
            "Not an employee"
        );

        let disclosure = Disclosure {
            verifier: verifier.clone(),
            disclosure_type,
            expires_at: env::block_timestamp() + (duration_days as u64 * 24 * 60 * 60 * 1_000_000_000),
            active: true,
        };

        let mut disclosures = self.disclosures.get(&employee_id).unwrap_or_else(|| {
            Vector::new(StorageKey::DisclosuresInner {
                employee_id: employee_id.clone(),
            })
        });
        disclosures.push(&disclosure);
        self.disclosures.insert(&employee_id, &disclosures);

        env::log_str(&format!(
            "Disclosure granted to {} for employee {}",
            verifier, employee_id
        ));
    }

    /// Employee revokes a disclosure
    pub fn revoke_disclosure(&mut self, verifier: AccountId) {
        let employee_id = env::predecessor_account_id();

        let mut disclosures = self
            .disclosures
            .get(&employee_id)
            .expect("No disclosures found");

        for i in 0..disclosures.len() {
            if let Some(mut d) = disclosures.get(i) {
                if d.verifier == verifier {
                    d.active = false;
                    disclosures.replace(i, &d);
                }
            }
        }
        self.disclosures.insert(&employee_id, &disclosures);

        env::log_str(&format!("Disclosure revoked for {}", verifier));
    }

    // ==================== ZK PROOF OPERATIONS (TRUSTLESS) ====================
    //
    // These operations use RISC Zero STARK proofs for TRUSTLESS verification.
    // No auditor or trusted third party is required.
    // The contract verifies proofs via cross-contract calls to zk-verifier.

    /// Submit an income proof for verification (TRUSTLESS)
    /// Called directly by employee with RISC Zero receipt
    /// Makes cross-contract call to zk-verifier and handles response via callback
    ///
    /// # Arguments
    /// * `proof_type` - Type of income proof (AboveThreshold, InRange, etc.)
    /// * `threshold` - Threshold value for AboveThreshold/Average proofs
    /// * `range_min` - Minimum for InRange proofs
    /// * `range_max` - Maximum for InRange proofs
    /// * `risc_zero_receipt` - STARK proof from RISC Zero (or Groth16 wrapped)
    /// * `history_commitment` - Commitment binding proof to payment history
    /// * `expires_in_days` - How long the proof should be valid
    pub fn submit_income_proof(
        &mut self,
        proof_type: IncomeProofType,
        threshold: Option<u64>,
        range_min: Option<u64>,
        range_max: Option<u64>,
        risc_zero_receipt: Vec<u8>,
        history_commitment: [u8; 32],
        expires_in_days: u32,
    ) -> Promise {
        let employee_id = env::predecessor_account_id();
        assert!(
            self.employees.get(&employee_id).is_some(),
            "Not an employee"
        );

        // Compute receipt hash for replay protection
        let receipt_hash = self.hash_receipt(&risc_zero_receipt);

        // Check replay protection
        assert!(
            self.used_receipts.get(&receipt_hash).is_none(),
            "Receipt already used"
        );

        // Validate proof parameters
        match proof_type {
            IncomeProofType::AboveThreshold | IncomeProofType::AverageAboveThreshold => {
                assert!(threshold.is_some(), "Threshold required for this proof type");
            }
            IncomeProofType::CreditScore => {
                assert!(threshold.is_some(), "Threshold required for credit score proof");
            }
            IncomeProofType::InRange => {
                assert!(range_min.is_some() && range_max.is_some(), "Range required for InRange proof");
                assert!(range_max.unwrap() > range_min.unwrap(), "Invalid range");
            }
        }

        // Verify history commitment matches on-chain payment history
        self.verify_history_commitment(&employee_id, &history_commitment);

        // Store pending proof (will be completed by callback)
        let pending = PendingProof {
            employee_id: employee_id.clone(),
            proof_type: proof_type.clone(),
            threshold,
            range_min,
            range_max,
            history_commitment,
            receipt_hash,
            expires_in_days,
            submitted_at: env::block_timestamp(),
        };
        self.pending_proofs.insert(&receipt_hash, &pending);

        // Mark receipt as used (replay protection)
        self.used_receipts.insert(&receipt_hash, &true);

        env::log_str(&format!(
            "Submitting income proof ({:?}) to zk-verifier for {}",
            proof_type, employee_id
        ));

        // Make cross-contract call to zk-verifier based on proof type
        match proof_type {
            IncomeProofType::AboveThreshold | IncomeProofType::AverageAboveThreshold => {
                ext_zk_verifier::ext(self.zk_verifier.clone())
                    .with_static_gas(GAS_FOR_VERIFY)
                    .verify_income_threshold(
                        risc_zero_receipt,
                        threshold.unwrap(),
                        history_commitment,
                    )
                    .then(
                        Self::ext(env::current_account_id())
                            .with_static_gas(GAS_FOR_CALLBACK)
                            .on_verify_income_threshold(receipt_hash)
                    )
            }
            IncomeProofType::InRange => {
                ext_zk_verifier::ext(self.zk_verifier.clone())
                    .with_static_gas(GAS_FOR_VERIFY)
                    .verify_income_range(
                        risc_zero_receipt,
                        range_min.unwrap(),
                        range_max.unwrap(),
                        history_commitment,
                    )
                    .then(
                        Self::ext(env::current_account_id())
                            .with_static_gas(GAS_FOR_CALLBACK)
                            .on_verify_income_range(receipt_hash)
                    )
            }
            IncomeProofType::CreditScore => {
                // Credit score threshold is u32
                let score_threshold = threshold.unwrap() as u32;
                ext_zk_verifier::ext(self.zk_verifier.clone())
                    .with_static_gas(GAS_FOR_VERIFY)
                    .verify_credit_score(
                        risc_zero_receipt,
                        score_threshold,
                        history_commitment,
                    )
                    .then(
                        Self::ext(env::current_account_id())
                            .with_static_gas(GAS_FOR_CALLBACK)
                            .on_verify_credit_score(receipt_hash)
                    )
            }
        }
    }

    /// Callback for income threshold verification
    #[private]
    pub fn on_verify_income_threshold(
        &mut self,
        receipt_hash: [u8; 32],
        #[callback_result] result: Result<IncomeThresholdOutput, PromiseError>,
    ) {
        let pending = self.pending_proofs.get(&receipt_hash)
            .expect("Pending proof not found");

        match result {
            Ok(output) => {
                if output.verified {
                    // Create verified proof record
                    let verified_proof = VerifiedIncomeProof {
                        proof_type: pending.proof_type.clone(),
                        threshold: Some(output.threshold),
                        range_min: None,
                        range_max: None,
                        result: output.meets_threshold,
                        payment_count: output.payment_count,
                        history_commitment: output.history_commitment,
                        receipt_hash,
                        verified_at: env::block_timestamp(),
                        expires_at: env::block_timestamp() + (pending.expires_in_days as u64 * 24 * 60 * 60 * 1_000_000_000),
                    };

                    // Store proof for employee
                    let mut proofs = self.employee_income_proofs.get(&pending.employee_id).unwrap_or_default();
                    proofs.retain(|p| p.proof_type != pending.proof_type);
                    proofs.push(verified_proof);
                    self.employee_income_proofs.insert(&pending.employee_id, &proofs);

                    env::log_str(&format!(
                        "Income threshold proof verified for {} - Result: {}",
                        pending.employee_id, output.meets_threshold
                    ));
                } else {
                    env::log_str(&format!(
                        "Income threshold proof FAILED verification for {}",
                        pending.employee_id
                    ));
                }
            }
            Err(e) => {
                env::log_str(&format!(
                    "Income threshold verification error for {}: {:?}",
                    pending.employee_id, e
                ));
            }
        }

        // Clean up pending proof
        self.pending_proofs.remove(&receipt_hash);
    }

    /// Callback for income range verification
    #[private]
    pub fn on_verify_income_range(
        &mut self,
        receipt_hash: [u8; 32],
        #[callback_result] result: Result<IncomeRangeOutput, PromiseError>,
    ) {
        let pending = self.pending_proofs.get(&receipt_hash)
            .expect("Pending proof not found");

        match result {
            Ok(output) => {
                if output.verified {
                    let verified_proof = VerifiedIncomeProof {
                        proof_type: pending.proof_type.clone(),
                        threshold: None,
                        range_min: Some(output.min),
                        range_max: Some(output.max),
                        result: output.in_range,
                        payment_count: output.payment_count,
                        history_commitment: output.history_commitment,
                        receipt_hash,
                        verified_at: env::block_timestamp(),
                        expires_at: env::block_timestamp() + (pending.expires_in_days as u64 * 24 * 60 * 60 * 1_000_000_000),
                    };

                    let mut proofs = self.employee_income_proofs.get(&pending.employee_id).unwrap_or_default();
                    proofs.retain(|p| p.proof_type != pending.proof_type);
                    proofs.push(verified_proof);
                    self.employee_income_proofs.insert(&pending.employee_id, &proofs);

                    env::log_str(&format!(
                        "Income range proof verified for {} - Result: {}",
                        pending.employee_id, output.in_range
                    ));
                } else {
                    env::log_str(&format!(
                        "Income range proof FAILED verification for {}",
                        pending.employee_id
                    ));
                }
            }
            Err(e) => {
                env::log_str(&format!(
                    "Income range verification error for {}: {:?}",
                    pending.employee_id, e
                ));
            }
        }

        self.pending_proofs.remove(&receipt_hash);
    }

    /// Callback for credit score verification
    #[private]
    pub fn on_verify_credit_score(
        &mut self,
        receipt_hash: [u8; 32],
        #[callback_result] result: Result<CreditScoreOutput, PromiseError>,
    ) {
        let pending = self.pending_proofs.get(&receipt_hash)
            .expect("Pending proof not found");

        match result {
            Ok(output) => {
                if output.verified {
                    let verified_proof = VerifiedIncomeProof {
                        proof_type: pending.proof_type.clone(),
                        threshold: Some(output.threshold as u64),
                        range_min: None,
                        range_max: None,
                        result: output.meets_threshold,
                        payment_count: output.payment_count,
                        history_commitment: output.history_commitment,
                        receipt_hash,
                        verified_at: env::block_timestamp(),
                        expires_at: env::block_timestamp() + (pending.expires_in_days as u64 * 24 * 60 * 60 * 1_000_000_000),
                    };

                    let mut proofs = self.employee_income_proofs.get(&pending.employee_id).unwrap_or_default();
                    proofs.retain(|p| p.proof_type != pending.proof_type);
                    proofs.push(verified_proof);
                    self.employee_income_proofs.insert(&pending.employee_id, &proofs);

                    env::log_str(&format!(
                        "Credit score proof verified for {} - Result: {}",
                        pending.employee_id, output.meets_threshold
                    ));
                } else {
                    env::log_str(&format!(
                        "Credit score proof FAILED verification for {}",
                        pending.employee_id
                    ));
                }
            }
            Err(e) => {
                env::log_str(&format!(
                    "Credit score verification error for {}: {:?}",
                    pending.employee_id, e
                ));
            }
        }

        self.pending_proofs.remove(&receipt_hash);
    }

    /// Get employee's income proof by type
    /// Returns None if no valid (non-expired) proof exists
    pub fn get_employee_income_proof(
        &self,
        employee_id: AccountId,
        proof_type: IncomeProofType,
    ) -> Option<VerifiedIncomeProof> {
        let proofs = self.employee_income_proofs.get(&employee_id)?;
        let now = env::block_timestamp();

        proofs.into_iter()
            .find(|p| p.proof_type == proof_type && p.expires_at > now)
    }

    /// Verify income requirement (for banks/landlords with disclosure)
    /// Returns true if employee has valid proof meeting requirement
    ///
    /// # Arguments
    /// * `employee_id` - Employee to check
    /// * `required_type` - Required proof type
    /// * `required_threshold` - Minimum threshold (for threshold proofs)
    pub fn verify_income_requirement(
        &self,
        employee_id: AccountId,
        required_type: IncomeProofType,
        required_threshold: u64,
    ) -> bool {
        let verifier = env::predecessor_account_id();

        // Check disclosure authorization
        assert!(
            self.check_disclosure_authorization(&employee_id, &verifier, &required_type),
            "Not authorized to verify"
        );

        // Get employee's proof
        let proof = match self.get_employee_income_proof(employee_id.clone(), required_type.clone()) {
            Some(p) => p,
            None => return false,
        };

        // Check if proof meets requirement
        if !proof.result {
            return false;
        }

        // For threshold proofs, check if threshold is sufficient
        match required_type {
            IncomeProofType::AboveThreshold | IncomeProofType::AverageAboveThreshold | IncomeProofType::CreditScore => {
                if let Some(proven_threshold) = proof.threshold {
                    proven_threshold >= required_threshold
                } else {
                    false
                }
            }
            IncomeProofType::InRange => {
                // For range, check if required threshold falls within proven range
                if let (Some(min), Some(max)) = (proof.range_min, proof.range_max) {
                    required_threshold >= min && required_threshold <= max
                } else {
                    false
                }
            }
        }
    }

    /// Verify an income proof for disclosure (detailed check)
    /// Called by third party verifier with authorization
    pub fn verify_income_proof_for_disclosure(
        &self,
        employee_id: AccountId,
        proof_type: IncomeProofType,
    ) -> Option<VerifiedIncomeProof> {
        let verifier = env::predecessor_account_id();

        // Check disclosure authorization
        assert!(
            self.check_disclosure_authorization(&employee_id, &verifier, &proof_type),
            "Not authorized to verify"
        );

        // Return proof if exists and not expired
        self.get_employee_income_proof(employee_id, proof_type)
    }

    // ==================== AUDITOR OPERATIONS (OPTIONAL - FOR FULL AUDIT ONLY) ====================
    //
    // Auditors are NOT required for income proofs (those are trustless via RISC Zero).
    // Auditors are ONLY used for FullAudit disclosures where complete access is needed
    // for regulatory/compliance purposes.

    /// Register an authorized auditor (for FullAudit disclosure only)
    pub fn register_authorized_auditor(&mut self, auditor: AccountId, license_info: String) {
        self.assert_owner();

        let auditor_record = AuthorizedAuditor {
            account_id: auditor.clone(),
            license_info,
            registered_at: env::block_timestamp(),
            active: true,
        };

        self.authorized_auditors.insert(&auditor, &auditor_record);
        env::log_str(&format!("Authorized auditor registered: {} (for FullAudit only)", auditor));
    }

    /// Deactivate an auditor
    pub fn deactivate_auditor(&mut self, auditor: AccountId) {
        self.assert_owner();

        if let Some(mut record) = self.authorized_auditors.get(&auditor) {
            record.active = false;
            self.authorized_auditors.insert(&auditor, &record);
            env::log_str(&format!("Auditor deactivated: {}", auditor));
        }
    }

    /// Check if account is an authorized auditor
    pub fn is_authorized_auditor(&self, account_id: AccountId) -> bool {
        self.authorized_auditors
            .get(&account_id)
            .map(|a| a.active)
            .unwrap_or(false)
    }

    // ==================== VIEW METHODS ====================

    /// Get employee info (public fields only)
    pub fn get_employee(&self, employee_id: AccountId) -> Option<Employee> {
        self.employees.get(&employee_id)
    }

    /// Get employee's payment count
    pub fn get_payment_count(&self, employee_id: AccountId) -> u64 {
        self.payment_history
            .get(&employee_id)
            .map(|h| h.len())
            .unwrap_or(0)
    }

    /// Get employee balance
    pub fn get_balance(&self, employee_id: AccountId) -> U128 {
        U128(self.employee_balances.get(&employee_id).unwrap_or(0))
    }

    /// Get company balance
    pub fn get_company_balance(&self) -> U128 {
        U128(self.company_balance)
    }

    /// Get contract stats
    pub fn get_stats(&self) -> (u32, u64, U128) {
        (
            self.total_employees,
            self.total_payments,
            U128(self.company_balance),
        )
    }

    /// List all employees (for company to process payments)
    /// Returns (employee_id, encrypted_name, status)
    /// Company can decrypt the name locally with their private key
    pub fn list_employees(&self, from_index: u64, limit: u64) -> Vec<(AccountId, Vec<u8>, EmploymentStatus)> {
        self.employees
            .iter()
            .skip(from_index as usize)
            .take(limit as usize)
            .map(|(employee_id, employee)| {
                (employee_id, employee.encrypted_name.clone(), employee.status)
            })
            .collect()
    }

    /// Get company's public key (for encrypting employee names)
    pub fn get_company_public_key(&self) -> Vec<u8> {
        self.company_public_key.clone()
    }

    /// Get all income proofs for an employee (if caller is authorized)
    pub fn get_all_income_proofs(&self, employee_id: AccountId) -> Vec<VerifiedIncomeProof> {
        let caller = env::predecessor_account_id();
        let now = env::block_timestamp();

        // Owner or employee themselves can see all their proofs
        if caller == self.owner || caller == employee_id {
            return self.employee_income_proofs
                .get(&employee_id)
                .unwrap_or_default()
                .into_iter()
                .filter(|p| p.expires_at > now)
                .collect();
        }

        // Others need disclosure authorization - return empty for now
        // (they should use verify_income_proof_for_disclosure instead)
        vec![]
    }

    /// Get auditor info
    pub fn get_auditor(&self, auditor_id: AccountId) -> Option<AuthorizedAuditor> {
        self.authorized_auditors.get(&auditor_id)
    }

    // ==================== INTERNAL METHODS ====================

    fn assert_owner(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner,
            "Only owner can call this"
        );
    }

    fn transfer_wzec(&self, recipient: AccountId, amount: U128) -> Promise {
        // Call wZEC token contract to transfer
        Promise::new(self.wzec_token.clone()).function_call(
            "ft_transfer".to_string(),
            serde_json::json!({
                "receiver_id": recipient,
                "amount": amount,
            })
            .to_string()
            .into_bytes(),
            near_sdk::NearToken::from_yoctonear(1), // 1 yoctoNEAR for storage
            near_sdk::Gas::from_tgas(10),
        )
    }

    fn verify_payment_proof(
        &self,
        _proof: &[u8],
        _salary_commitment: &[u8; 32],
        _payment_commitment: &[u8; 32],
    ) {
        // TODO: Call zk-verifier contract to verify RISC Zero proof
        // For now, we trust the proof (development mode)
        // In production:
        // 1. Deserialize RISC Zero receipt
        // 2. Call zk-verifier.verify_payment_proof()
        // 3. Assert proof is valid
        env::log_str("Payment proof verification (dev mode - skipped)");
    }

    /// Hash a RISC Zero receipt for replay protection
    fn hash_receipt(&self, receipt: &[u8]) -> [u8; 32] {
        let mut hasher = Sha256::new();
        hasher.update(b"near-private-payroll:receipt:v1:");
        hasher.update(receipt);
        let result = hasher.finalize();
        let mut hash = [0u8; 32];
        hash.copy_from_slice(&result);
        hash
    }

    /// Verify history commitment matches on-chain payment history
    fn verify_history_commitment(&self, employee_id: &AccountId, commitment: &[u8; 32]) {
        // Compute commitment from actual payment history
        let history = self.payment_history.get(employee_id).expect("No payment history");

        let mut hasher = Sha256::new();
        hasher.update(b"near-private-payroll:history:v1:");

        for i in 0..history.len() {
            if let Some(payment) = history.get(i) {
                hasher.update(&payment.commitment);
            }
        }

        let result = hasher.finalize();
        let mut computed = [0u8; 32];
        computed.copy_from_slice(&result);

        assert_eq!(&computed, commitment, "History commitment mismatch - proof not bound to on-chain data");
    }

    /// Check if verifier is authorized for the given disclosure type
    fn check_disclosure_authorization(
        &self,
        employee_id: &AccountId,
        verifier: &AccountId,
        proof_type: &IncomeProofType,
    ) -> bool {
        // Owner always has access
        if verifier == &self.owner {
            return true;
        }

        // Employee has access to their own proofs
        if verifier == employee_id {
            return true;
        }

        // Check disclosures
        let disclosures = match self.disclosures.get(employee_id) {
            Some(d) => d,
            None => return false,
        };

        let now = env::block_timestamp();

        for i in 0..disclosures.len() {
            if let Some(d) = disclosures.get(i) {
                if d.verifier == *verifier && d.active && d.expires_at > now {
                    // Check if disclosure type matches
                    match (&d.disclosure_type, proof_type) {
                        // FullAudit grants access to everything
                        (DisclosureType::FullAudit, _) => {
                            // For FullAudit, also check if verifier is authorized auditor
                            if self.is_authorized_auditor(verifier.clone()) {
                                return true;
                            }
                        }
                        // IncomeAboveThreshold grants access to AboveThreshold and AverageAboveThreshold
                        (DisclosureType::IncomeAboveThreshold { .. }, IncomeProofType::AboveThreshold) |
                        (DisclosureType::IncomeAboveThreshold { .. }, IncomeProofType::AverageAboveThreshold) => {
                            return true;
                        }
                        // IncomeRange grants access to InRange
                        (DisclosureType::IncomeRange { .. }, IncomeProofType::InRange) => {
                            return true;
                        }
                        // Credit score proofs need specific disclosure (could be part of IncomeAboveThreshold for now)
                        (DisclosureType::IncomeAboveThreshold { .. }, IncomeProofType::CreditScore) => {
                            return true;
                        }
                        _ => {}
                    }
                }
            }
        }

        false
    }

    fn extract_amount_from_proof(&self, _proof: &[u8]) -> u128 {
        // TODO: Extract verified amount from RISC Zero proof journal
        // For now, return placeholder
        // In production, this parses the proof's public outputs
        0
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
    fn test_new_contract() {
        let owner: AccountId = "company.near".parse().unwrap();
        let wzec: AccountId = "wzec.near".parse().unwrap();
        let verifier: AccountId = "verifier.near".parse().unwrap();

        let context = get_context(owner.clone());
        testing_env!(context.build());

        let contract = PayrollContract::new(owner.clone(), wzec, verifier);
        assert_eq!(contract.owner, owner);
        assert_eq!(contract.total_employees, 0);
    }

    #[test]
    fn test_add_employee() {
        let owner: AccountId = "company.near".parse().unwrap();
        let wzec: AccountId = "wzec.near".parse().unwrap();
        let verifier: AccountId = "verifier.near".parse().unwrap();
        let employee: AccountId = "alice.near".parse().unwrap();

        let context = get_context(owner.clone());
        testing_env!(context.build());

        let mut contract = PayrollContract::new(owner, wzec, verifier);

        contract.add_employee(
            employee.clone(),
            vec![1, 2, 3], // encrypted name
            vec![4, 5, 6], // encrypted salary
            [0u8; 32],     // salary commitment
            vec![7, 8, 9], // public key
        );

        assert_eq!(contract.total_employees, 1);
        assert!(contract.employees.get(&employee).is_some());
    }
}
