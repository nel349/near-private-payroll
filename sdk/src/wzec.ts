/**
 * wZEC Token Contract Interface
 */

import { Contract, Account } from 'near-api-js';

/** Contract methods interface */
interface WZecContractMethods {
  // Change methods
  mint: (args: {
    receiver_id: string;
    amount: string;
    zcash_tx_hash: string;
  }) => Promise<void>;
  burn_for_zcash: (args: {
    amount: string;
    zcash_shielded_address: string;
  }) => Promise<void>;
  update_bridge_controller: (args: { new_controller: string }) => Promise<void>;
  transfer_ownership: (args: { new_owner: string }) => Promise<void>;

  // NEP-141 methods
  ft_transfer: (args: {
    receiver_id: string;
    amount: string;
    memo?: string;
  }) => Promise<void>;
  ft_transfer_call: (args: {
    receiver_id: string;
    amount: string;
    memo?: string;
    msg: string;
  }) => Promise<string>;
  ft_balance_of: (args: { account_id: string }) => Promise<string>;
  ft_total_supply: () => Promise<string>;

  // View methods
  get_bridge_controller: () => Promise<string>;
  get_total_locked_zec: () => Promise<string>;
  get_withdrawal_nonce: () => Promise<number>;
  get_owner: () => Promise<string>;
}

/**
 * wZEC Token SDK
 *
 * Provides a TypeScript interface to the wrapped ZEC token contract.
 */
export class WZecToken {
  private contract: Contract & WZecContractMethods;
  private account: Account;

  constructor(account: Account, contractId: string) {
    this.account = account;
    this.contract = new Contract(account, contractId, {
      viewMethods: [
        'ft_balance_of',
        'ft_total_supply',
        'get_bridge_controller',
        'get_total_locked_zec',
        'get_withdrawal_nonce',
        'get_owner',
      ],
      changeMethods: [
        'mint',
        'burn_for_zcash',
        'update_bridge_controller',
        'transfer_ownership',
        'ft_transfer',
        'ft_transfer_call',
      ],
    }) as Contract & WZecContractMethods;
  }

  // ==================== BRIDGE OPERATIONS ====================

  /**
   * Mint wZEC tokens (bridge controller only)
   *
   * @param receiverId - Recipient's NEAR account
   * @param amount - Amount to mint
   * @param zcashTxHash - Zcash transaction hash for tracking
   */
  async mint(
    receiverId: string,
    amount: string,
    zcashTxHash: string
  ): Promise<void> {
    await this.contract.mint({
      receiver_id: receiverId,
      amount,
      zcash_tx_hash: zcashTxHash,
    });
  }

  /**
   * Burn wZEC to withdraw to Zcash
   *
   * @param amount - Amount to burn
   * @param zcashShieldedAddress - Zcash shielded address (z-addr)
   */
  async burnForZcash(
    amount: string,
    zcashShieldedAddress: string
  ): Promise<void> {
    // Validate Zcash address format
    if (
      !zcashShieldedAddress.startsWith('zs') &&
      !zcashShieldedAddress.startsWith('zc')
    ) {
      throw new Error('Invalid Zcash shielded address');
    }

    await this.contract.burn_for_zcash({
      amount,
      zcash_shielded_address: zcashShieldedAddress,
    });
  }

  // ==================== ADMIN OPERATIONS ====================

  /**
   * Update bridge controller (owner only)
   */
  async updateBridgeController(newController: string): Promise<void> {
    await this.contract.update_bridge_controller({
      new_controller: newController,
    });
  }

  /**
   * Transfer ownership
   */
  async transferOwnership(newOwner: string): Promise<void> {
    await this.contract.transfer_ownership({ new_owner: newOwner });
  }

  // ==================== NEP-141 OPERATIONS ====================

  /**
   * Transfer wZEC to another account
   */
  async transfer(receiverId: string, amount: string, memo?: string): Promise<void> {
    await this.contract.ft_transfer({
      receiver_id: receiverId,
      amount,
      memo,
    });
  }

  /**
   * Transfer wZEC with callback (e.g., to payroll contract)
   *
   * @param receiverId - Recipient contract
   * @param amount - Amount to transfer
   * @param msg - Message to pass to receiver's ft_on_transfer
   */
  async transferCall(
    receiverId: string,
    amount: string,
    msg: string,
    memo?: string
  ): Promise<string> {
    return this.contract.ft_transfer_call({
      receiver_id: receiverId,
      amount,
      msg,
      memo,
    });
  }

  /**
   * Deposit wZEC to payroll contract
   * Convenience method for transferCall with "deposit" message
   */
  async depositToPayroll(payrollContractId: string, amount: string): Promise<string> {
    return this.transferCall(payrollContractId, amount, 'deposit');
  }

  // ==================== VIEW METHODS ====================

  /**
   * Get wZEC balance
   */
  async balanceOf(accountId: string): Promise<string> {
    return this.contract.ft_balance_of({ account_id: accountId });
  }

  /**
   * Get total supply
   */
  async totalSupply(): Promise<string> {
    return this.contract.ft_total_supply();
  }

  /**
   * Get bridge controller
   */
  async getBridgeController(): Promise<string> {
    return this.contract.get_bridge_controller();
  }

  /**
   * Get total ZEC locked on Zcash side
   */
  async getTotalLockedZec(): Promise<string> {
    return this.contract.get_total_locked_zec();
  }

  /**
   * Get current withdrawal nonce
   */
  async getWithdrawalNonce(): Promise<number> {
    return this.contract.get_withdrawal_nonce();
  }

  /**
   * Get owner
   */
  async getOwner(): Promise<string> {
    return this.contract.get_owner();
  }
}
