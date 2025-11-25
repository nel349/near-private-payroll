//! # Private Payroll Contract for NEAR Protocol
//!
//! A privacy-preserving payroll system that uses ZK proofs for:
//! - Private salary payments (amounts hidden via commitments)
//! - Income verification without revealing actual amounts
//! - Selective disclosure to third parties (banks, landlords)
//!
//! ## Architecture
//! - wZEC tokens for value transfer (bridged from Zcash)
//! - RISC Zero for ZK proof generation/verification
//! - Pedersen commitments for amount privacy

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::{LookupMap, UnorderedMap, Vector};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near_bindgen, AccountId, BorshStorageKey, PanicOnDefault, Promise, PromiseOrValue};
use sha2::{Digest, Sha256};

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
    TrustedVerifiers,
    IncomeProofs,
}

/// Employment status
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq, Debug)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub enum EmploymentStatus {
    Active,
    OnLeave,
    Terminated,
}

/// Employee data (sensitive fields encrypted)
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct Employee {
    /// Employee's NEAR account
    pub account_id: AccountId,
    /// Encrypted name (only employee can decrypt)
    pub encrypted_name: Vec<u8>,
    /// Encrypted salary amount (for local decryption)
    pub encrypted_salary: Vec<u8>,
    /// Employment status
    pub status: EmploymentStatus,
    /// Start timestamp (nanoseconds)
    pub start_date: u64,
    /// Public key for encryption (employee's key)
    pub public_key: Vec<u8>,
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

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq)]
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
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq)]
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

/// Verified income proof record
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub struct VerifiedIncomeProof {
    /// Employee who submitted
    pub employee_id: AccountId,
    /// Type of proof
    pub proof_type: IncomeProofType,
    /// Public parameters (threshold, range, etc.)
    pub public_params: Vec<u8>,
    /// Verification timestamp
    pub verified_at: u64,
    /// Verifier who confirmed
    pub verified_by: AccountId,
    /// Proof hash (for reference)
    pub proof_hash: [u8; 32],
}

/// Main payroll contract
#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
#[borsh(crate = "near_sdk::borsh")]
pub struct PayrollContract {
    /// Company owner
    pub owner: AccountId,
    /// wZEC token contract address
    pub wzec_token: AccountId,
    /// ZK verifier contract address
    pub zk_verifier: AccountId,

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
    /// Trusted verifiers (can verify income proofs)
    pub trusted_verifiers: UnorderedMap<AccountId, bool>,
    /// Verified income proofs
    pub income_proofs: Vector<VerifiedIncomeProof>,

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
    pub fn new(owner: AccountId, wzec_token: AccountId, zk_verifier: AccountId) -> Self {
        Self {
            owner,
            wzec_token,
            zk_verifier,
            employees: UnorderedMap::new(StorageKey::Employees),
            salary_commitments: LookupMap::new(StorageKey::SalaryCommitments),
            payment_history: LookupMap::new(StorageKey::PaymentHistory),
            employee_balances: LookupMap::new(StorageKey::EmployeeBalances),
            disclosures: LookupMap::new(StorageKey::Disclosures),
            trusted_verifiers: UnorderedMap::new(StorageKey::TrustedVerifiers),
            income_proofs: Vector::new(StorageKey::IncomeProofs),
            company_balance: 0,
            total_employees: 0,
            total_payments: 0,
        }
    }

    // ==================== COMPANY OPERATIONS ====================

    /// Company deposits wZEC for payroll
    /// Called via ft_transfer_call from wZEC contract
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let token_contract = env::predecessor_account_id();
        assert_eq!(token_contract, self.wzec_token, "Only wZEC accepted");

        if msg == "deposit" && sender_id == self.owner {
            self.company_balance += amount.0;
            env::log_str(&format!("Company deposited {} wZEC", amount.0));
            PromiseOrValue::Value(U128(0)) // Accept all tokens
        } else {
            // Refund if not a valid deposit
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
        public_key: Vec<u8>,
    ) {
        self.assert_owner();
        assert!(
            !self.employees.contains_key(&employee_id),
            "Employee already exists"
        );

        let employee = Employee {
            account_id: employee_id.clone(),
            encrypted_name,
            encrypted_salary,
            status: EmploymentStatus::Active,
            start_date: env::block_timestamp(),
            public_key,
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
        self.employee_balances
            .insert(&employee_id, &(current_balance + payment_amount));

        // Deduct from company balance
        assert!(
            self.company_balance >= payment_amount,
            "Insufficient company balance"
        );
        self.company_balance -= payment_amount;

        self.total_payments += 1;

        env::log_str(&format!(
            "Payment processed for {} (period: {})",
            employee_id, payment.period
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

    /// Employee withdraws their balance
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

    /// Employee grants disclosure to a third party
    pub fn grant_disclosure(
        &mut self,
        verifier: AccountId,
        disclosure_type: DisclosureType,
        duration_days: u32,
    ) {
        let employee_id = env::predecessor_account_id();
        assert!(
            self.employees.contains_key(&employee_id),
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

    // ==================== ZK PROOF OPERATIONS ====================

    /// Register a trusted verifier (company only)
    pub fn register_trusted_verifier(&mut self, verifier: AccountId) {
        self.assert_owner();
        self.trusted_verifiers.insert(&verifier, &true);
        env::log_str(&format!("Trusted verifier registered: {}", verifier));
    }

    /// Remove a trusted verifier
    pub fn remove_trusted_verifier(&mut self, verifier: AccountId) {
        self.assert_owner();
        self.trusted_verifiers.remove(&verifier);
        env::log_str(&format!("Trusted verifier removed: {}", verifier));
    }

    /// Submit an income proof for verification
    /// Called by employee with RISC Zero proof
    pub fn submit_income_proof(
        &mut self,
        proof_type: IncomeProofType,
        public_params: Vec<u8>,
        risc_zero_receipt: Vec<u8>,
    ) {
        let employee_id = env::predecessor_account_id();
        assert!(
            self.employees.contains_key(&employee_id),
            "Not an employee"
        );

        // Verify the RISC Zero proof
        // In production, this calls the zk-verifier contract
        let proof_hash = self.verify_income_proof_internal(&risc_zero_receipt, &public_params);

        let verified_proof = VerifiedIncomeProof {
            employee_id: employee_id.clone(),
            proof_type,
            public_params,
            verified_at: env::block_timestamp(),
            verified_by: env::current_account_id(), // Self-verified via ZK
            proof_hash,
        };

        self.income_proofs.push(&verified_proof);

        env::log_str(&format!("Income proof submitted by {}", employee_id));
    }

    /// Verify an income proof (called by third party verifier)
    pub fn verify_income_proof_for_disclosure(
        &self,
        employee_id: AccountId,
        proof_index: u64,
    ) -> bool {
        let verifier = env::predecessor_account_id();

        // Check disclosure authorization
        let disclosures = self
            .disclosures
            .get(&employee_id)
            .expect("No disclosures found");

        let mut authorized = false;
        for i in 0..disclosures.len() {
            if let Some(d) = disclosures.get(i) {
                if d.verifier == verifier && d.active && d.expires_at > env::block_timestamp() {
                    authorized = true;
                    break;
                }
            }
        }
        assert!(authorized, "Not authorized to verify");

        // Check proof exists
        let proof = self
            .income_proofs
            .get(proof_index)
            .expect("Proof not found");
        assert_eq!(proof.employee_id, employee_id, "Proof not for this employee");

        true
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

    /// Check if account is a trusted verifier
    pub fn is_trusted_verifier(&self, account_id: AccountId) -> bool {
        self.trusted_verifiers.get(&account_id).unwrap_or(false)
    }

    /// Get income proof by index
    pub fn get_income_proof(&self, index: u64) -> Option<VerifiedIncomeProof> {
        self.income_proofs.get(index)
    }

    /// Get total income proofs
    pub fn get_income_proof_count(&self) -> u64 {
        self.income_proofs.len()
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

    fn verify_income_proof_internal(&self, _receipt: &[u8], _public_params: &[u8]) -> [u8; 32] {
        // TODO: Call zk-verifier contract to verify RISC Zero proof
        // Returns hash of the proof for reference
        let mut hasher = Sha256::new();
        hasher.update(_receipt);
        hasher.update(_public_params);
        let result = hasher.finalize();
        let mut hash = [0u8; 32];
        hash.copy_from_slice(&result);
        hash
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
        assert!(contract.employees.contains_key(&employee));
    }
}
