//! # Wrapped ZEC (wZEC) Token Contract
//!
//! NEP-141 fungible token representing bridged Zcash (ZEC).
//!
//! ## Bridge Flow
//! 1. User deposits ZEC to bridge custody address on Zcash (shielded)
//! 2. Bridge relayer detects deposit and calls `mint()` on this contract
//! 3. User receives wZEC on NEAR
//! 4. User can use wZEC in payroll contract
//! 5. User can burn wZEC to withdraw back to Zcash shielded address
//!
//! ## Security
//! - Only bridge controller can mint/burn
//! - Tracks total locked ZEC on Zcash side
//! - Events emitted for bridge relayer to process withdrawals

use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::FungibleToken;
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::LazyOption;
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json;
use near_sdk::{
    env, log, near, near_bindgen, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise,
    PromiseOrValue,
};

#[derive(BorshStorageKey, BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
pub enum StorageKey {
    FungibleToken,
    Metadata,
}

/// Event emitted when wZEC is burned for Zcash withdrawal
#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct BurnForZcashEvent {
    pub burner: AccountId,
    pub amount: U128,
    pub zcash_shielded_address: String,
    pub nonce: u64,
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
#[borsh(crate = "near_sdk::borsh")]
pub struct WZecToken {
    /// NEP-141 token implementation
    token: FungibleToken,
    /// Token metadata
    metadata: LazyOption<FungibleTokenMetadata>,
    /// Bridge controller (only account that can mint/burn)
    bridge_controller: AccountId,
    /// Total ZEC locked on Zcash side (for verification)
    total_locked_zec: u128,
    /// Nonce for withdrawal events (prevents replay)
    withdrawal_nonce: u64,
    /// Contract owner (can update bridge controller)
    owner: AccountId,
}

#[near_bindgen]
impl WZecToken {
    /// Initialize the wZEC token contract
    #[init]
    pub fn new(owner: AccountId, bridge_controller: AccountId) -> Self {
        let metadata = FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: "Wrapped Zcash".to_string(),
            symbol: "wZEC".to_string(),
            icon: Some("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzMiAzMiI+PGNpcmNsZSBjeD0iMTYiIGN5PSIxNiIgcj0iMTYiIGZpbGw9IiNmNGIwMjgiLz48cGF0aCBkPSJNMTYgNnYyME0xMCAxMmgxMk0xMCAyMGgxMiIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiLz48L3N2Zz4=".to_string()),
            reference: None,
            reference_hash: None,
            decimals: 8, // ZEC has 8 decimals
        };

        let mut this = Self {
            token: FungibleToken::new(StorageKey::FungibleToken),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            bridge_controller,
            total_locked_zec: 0,
            withdrawal_nonce: 0,
            owner,
        };

        this
    }

    // ==================== BRIDGE OPERATIONS ====================

    /// Mint wZEC when ZEC is deposited to bridge on Zcash side
    /// Only callable by bridge controller
    #[payable]
    pub fn mint(&mut self, receiver_id: AccountId, amount: U128, zcash_tx_hash: String) {
        self.assert_bridge_controller();

        // Register account if needed
        if !self.token.accounts.contains_key(&receiver_id) {
            self.token.internal_register_account(&receiver_id);
        }

        // Mint tokens
        self.token.internal_deposit(&receiver_id, amount.0);
        self.total_locked_zec += amount.0;

        log!(
            "Minted {} wZEC to {} (Zcash tx: {})",
            amount.0,
            receiver_id,
            zcash_tx_hash
        );
    }

    /// Burn wZEC to withdraw to Zcash shielded address
    /// Emits event for bridge relayer to process
    pub fn burn_for_zcash(&mut self, amount: U128, zcash_shielded_address: String) {
        let burner = env::predecessor_account_id();

        // Validate Zcash address format (basic check)
        assert!(
            zcash_shielded_address.starts_with("zs") || zcash_shielded_address.starts_with("zc"),
            "Invalid Zcash shielded address"
        );

        // Burn tokens
        self.token.internal_withdraw(&burner, amount.0);
        self.total_locked_zec = self.total_locked_zec.saturating_sub(amount.0);

        // Increment nonce
        self.withdrawal_nonce += 1;

        // Emit event for bridge relayer
        let event = BurnForZcashEvent {
            burner: burner.clone(),
            amount,
            zcash_shielded_address: zcash_shielded_address.clone(),
            nonce: self.withdrawal_nonce,
        };

        log!(
            "EVENT_BURN_FOR_ZCASH:{}",
            serde_json::to_string(&event).unwrap()
        );

        log!(
            "Burned {} wZEC from {} for withdrawal to {}",
            amount.0,
            burner,
            zcash_shielded_address
        );
    }

    // ==================== ADMIN OPERATIONS ====================

    /// Update bridge controller (owner only)
    pub fn update_bridge_controller(&mut self, new_controller: AccountId) {
        self.assert_owner();
        self.bridge_controller = new_controller.clone();
        log!("Bridge controller updated to {}", new_controller);
    }

    /// Transfer ownership
    pub fn transfer_ownership(&mut self, new_owner: AccountId) {
        self.assert_owner();
        self.owner = new_owner.clone();
        log!("Ownership transferred to {}", new_owner);
    }

    // ==================== VIEW METHODS ====================

    /// Get bridge controller
    pub fn get_bridge_controller(&self) -> AccountId {
        self.bridge_controller.clone()
    }

    /// Get total locked ZEC
    pub fn get_total_locked_zec(&self) -> U128 {
        U128(self.total_locked_zec)
    }

    /// Get current withdrawal nonce
    pub fn get_withdrawal_nonce(&self) -> u64 {
        self.withdrawal_nonce
    }

    /// Get owner
    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    // ==================== INTERNAL ====================

    fn assert_bridge_controller(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.bridge_controller,
            "Only bridge controller can call this"
        );
    }

    fn assert_owner(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner,
            "Only owner can call this"
        );
    }
}

// Implement NEP-141 FungibleTokenCore
near_contract_standards::impl_fungible_token_core!(WZecToken, token);

// Implement NEP-145 StorageManagement manually (macro has type mismatch bug)
use near_contract_standards::storage_management::{StorageBalance, StorageBalanceBounds, StorageManagement};

#[near]
impl StorageManagement for WZecToken {
    #[payable]
    fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        registration_only: Option<bool>,
    ) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        #[allow(unused_variables)]
        if let Some((account_id, balance)) = self.token.internal_storage_unregister(force) {
            true
        } else {
            false
        }
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

// Implement FungibleTokenMetadataProvider
#[near_bindgen]
impl FungibleTokenMetadataProvider for WZecToken {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        self.metadata.get().unwrap()
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
        let bridge: AccountId = "bridge.near".parse().unwrap();

        let context = get_context(owner.clone());
        testing_env!(context.build());

        let contract = WZecToken::new(owner.clone(), bridge.clone());
        assert_eq!(contract.get_owner(), owner);
        assert_eq!(contract.get_bridge_controller(), bridge);
        assert_eq!(contract.get_total_locked_zec(), U128(0));
    }

    #[test]
    fn test_mint() {
        let owner: AccountId = "owner.near".parse().unwrap();
        let bridge: AccountId = "bridge.near".parse().unwrap();
        let user: AccountId = "user.near".parse().unwrap();

        let context = get_context(owner.clone());
        testing_env!(context.build());

        let mut contract = WZecToken::new(owner, bridge.clone());

        // Mint as bridge controller
        let context = get_context(bridge)
            .attached_deposit(NearToken::from_yoctonear(1))
            .build();
        testing_env!(context);

        contract.mint(user.clone(), U128(1000), "tx123".to_string());

        assert_eq!(contract.ft_balance_of(user), U128(1000));
        assert_eq!(contract.get_total_locked_zec(), U128(1000));
    }
}
