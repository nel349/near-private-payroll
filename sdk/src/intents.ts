/**
 * NEAR Intents Adapter SDK
 *
 * Provides cross-chain functionality for the Private Payroll system:
 * - Company deposits from Zcash and other chains
 * - Employee withdrawals to Zcash (shielded), Solana, Ethereum, etc.
 */

import {
  DestinationChain,
  PendingDeposit,
  PendingWithdrawal,
  ChainConfig,
  IntentsAdapterStats,
  ZcashAddressType,
} from './types';

/**
 * Intents Adapter SDK for cross-chain operations
 */
export class IntentsAdapterSDK {
  private contractId: string;
  private near: any; // NEAR connection

  constructor(contractId: string, near: any) {
    this.contractId = contractId;
    this.near = near;
  }

  // ==================== ADDRESS VALIDATION ====================

  /**
   * Validate a Zcash address
   */
  static validateZcashAddress(address: string): {
    valid: boolean;
    type?: ZcashAddressType;
    error?: string;
  } {
    // Shielded addresses (Sapling)
    if (address.startsWith('zs')) {
      if (address.length >= 78) {
        return { valid: true, type: ZcashAddressType.Shielded };
      }
      return { valid: false, error: 'Invalid shielded address length' };
    }

    // Legacy shielded (Sprout) - deprecated but still valid
    if (address.startsWith('zc')) {
      return { valid: true, type: ZcashAddressType.Shielded };
    }

    // Transparent addresses
    if (address.startsWith('t1') || address.startsWith('t3')) {
      if (address.length >= 34 && address.length <= 36) {
        return { valid: true, type: ZcashAddressType.Transparent };
      }
      return { valid: false, error: 'Invalid transparent address length' };
    }

    return { valid: false, error: 'Unknown Zcash address format' };
  }

  /**
   * Validate an address for a given chain
   */
  static validateAddress(
    chain: DestinationChain,
    address: string
  ): { valid: boolean; error?: string } {
    switch (chain) {
      case DestinationChain.Zcash: {
        const result = this.validateZcashAddress(address);
        return { valid: result.valid, error: result.error };
      }

      case DestinationChain.Solana:
        // Base58 encoded, 32-44 characters
        if (address.length >= 32 && address.length <= 44) {
          return { valid: true };
        }
        return { valid: false, error: 'Invalid Solana address length' };

      case DestinationChain.Ethereum:
        // 0x prefixed, 42 characters
        if (address.startsWith('0x') && address.length === 42) {
          return { valid: true };
        }
        return { valid: false, error: 'Invalid Ethereum address format' };

      case DestinationChain.Bitcoin:
        // Various formats
        if (
          address.startsWith('1') ||
          address.startsWith('3') ||
          address.startsWith('bc1')
        ) {
          return { valid: true };
        }
        return { valid: false, error: 'Invalid Bitcoin address format' };

      case DestinationChain.Near:
        if (
          address.endsWith('.near') ||
          address.endsWith('.testnet') ||
          (address.length === 64 && /^[a-f0-9]+$/i.test(address))
        ) {
          return { valid: true };
        }
        return { valid: false, error: 'Invalid NEAR address format' };

      default:
        return { valid: false, error: 'Unknown chain' };
    }
  }

  // ==================== VIEW METHODS ====================

  /**
   * Get pending deposit by source transaction hash
   */
  async getPendingDeposit(sourceTxHash: string): Promise<PendingDeposit | null> {
    const account = await this.near.account(this.contractId);
    return account.viewFunction({
      contractId: this.contractId,
      methodName: 'get_pending_deposit',
      args: { source_tx_hash: sourceTxHash },
    });
  }

  /**
   * Get pending withdrawal by ID
   */
  async getPendingWithdrawal(
    withdrawalId: string
  ): Promise<PendingWithdrawal | null> {
    const account = await this.near.account(this.contractId);
    return account.viewFunction({
      contractId: this.contractId,
      methodName: 'get_pending_withdrawal',
      args: { withdrawal_id: withdrawalId },
    });
  }

  /**
   * Get chain configuration
   */
  async getChainConfig(chain: DestinationChain): Promise<ChainConfig | null> {
    const account = await this.near.account(this.contractId);
    return account.viewFunction({
      contractId: this.contractId,
      methodName: 'get_chain_config',
      args: { chain },
    });
  }

  /**
   * Check if token is supported
   */
  async isTokenSupported(tokenId: string): Promise<boolean> {
    const account = await this.near.account(this.contractId);
    return account.viewFunction({
      contractId: this.contractId,
      methodName: 'is_token_supported',
      args: { token: tokenId },
    });
  }

  /**
   * Get contract statistics
   */
  async getStats(): Promise<IntentsAdapterStats> {
    const account = await this.near.account(this.contractId);
    const [totalDeposits, totalWithdrawals, withdrawalNonce] =
      await account.viewFunction({
        contractId: this.contractId,
        methodName: 'get_stats',
        args: {},
      });
    return { totalDeposits, totalWithdrawals, withdrawalNonce };
  }

  /**
   * Get owner
   */
  async getOwner(): Promise<string> {
    const account = await this.near.account(this.contractId);
    return account.viewFunction({
      contractId: this.contractId,
      methodName: 'get_owner',
      args: {},
    });
  }

  /**
   * Get payroll contract address
   */
  async getPayrollContract(): Promise<string> {
    const account = await this.near.account(this.contractId);
    return account.viewFunction({
      contractId: this.contractId,
      methodName: 'get_payroll_contract',
      args: {},
    });
  }

  /**
   * Get intents contract address
   */
  async getIntentsContract(): Promise<string> {
    const account = await this.near.account(this.contractId);
    return account.viewFunction({
      contractId: this.contractId,
      methodName: 'get_intents_contract',
      args: {},
    });
  }

  /**
   * Get authorized relayers
   */
  async getRelayers(): Promise<string[]> {
    const account = await this.near.account(this.contractId);
    return account.viewFunction({
      contractId: this.contractId,
      methodName: 'get_relayers',
      args: {},
    });
  }

  // ==================== ADMIN METHODS ====================

  /**
   * Add authorized bridge relayer (owner only)
   */
  async addRelayer(
    signerAccount: any,
    relayerAccountId: string
  ): Promise<void> {
    await signerAccount.functionCall({
      contractId: this.contractId,
      methodName: 'add_relayer',
      args: { relayer: relayerAccountId },
      gas: '30000000000000',
    });
  }

  /**
   * Remove authorized bridge relayer (owner only)
   */
  async removeRelayer(
    signerAccount: any,
    relayerAccountId: string
  ): Promise<void> {
    await signerAccount.functionCall({
      contractId: this.contractId,
      methodName: 'remove_relayer',
      args: { relayer: relayerAccountId },
      gas: '30000000000000',
    });
  }

  /**
   * Update chain configuration (owner only)
   */
  async updateChainConfig(
    signerAccount: any,
    config: ChainConfig
  ): Promise<void> {
    await signerAccount.functionCall({
      contractId: this.contractId,
      methodName: 'update_chain_config',
      args: { config },
      gas: '30000000000000',
    });
  }

  /**
   * Add supported token (owner only)
   */
  async addSupportedToken(
    signerAccount: any,
    tokenId: string
  ): Promise<void> {
    await signerAccount.functionCall({
      contractId: this.contractId,
      methodName: 'add_supported_token',
      args: { token: tokenId },
      gas: '30000000000000',
    });
  }

  // ==================== RELAYER METHODS ====================

  /**
   * Confirm cross-chain deposit (relayer only)
   */
  async confirmCrossChainDeposit(
    signerAccount: any,
    sourceTxHash: string,
    amount: string,
    companyId: string,
    sourceChain: DestinationChain
  ): Promise<void> {
    await signerAccount.functionCall({
      contractId: this.contractId,
      methodName: 'confirm_cross_chain_deposit',
      args: {
        source_tx_hash: sourceTxHash,
        amount,
        company_id: companyId,
        source_chain: sourceChain,
      },
      gas: '50000000000000',
    });
  }

  /**
   * Confirm withdrawal completion (relayer only)
   */
  async confirmWithdrawalComplete(
    signerAccount: any,
    withdrawalId: string,
    destinationTxHash: string
  ): Promise<void> {
    await signerAccount.functionCall({
      contractId: this.contractId,
      methodName: 'confirm_withdrawal_complete',
      args: {
        withdrawal_id: withdrawalId,
        destination_tx_hash: destinationTxHash,
      },
      gas: '30000000000000',
    });
  }

  // ==================== HELPER METHODS ====================

  /**
   * Get recommended chain for privacy-preserving withdrawal
   */
  static getRecommendedChainForPrivacy(): DestinationChain {
    return DestinationChain.Zcash;
  }

  /**
   * Get recommended address type for Zcash (shielded for privacy)
   */
  static getRecommendedZcashAddressType(): ZcashAddressType {
    return ZcashAddressType.Shielded;
  }

  /**
   * Calculate withdrawal fee
   */
  calculateWithdrawalFee(amount: bigint, feeBps: number): bigint {
    return (amount * BigInt(feeBps)) / BigInt(10000);
  }

  /**
   * Calculate net withdrawal amount after fees
   */
  calculateNetWithdrawal(amount: bigint, feeBps: number): bigint {
    const fee = this.calculateWithdrawalFee(amount, feeBps);
    return amount - fee;
  }
}

/**
 * Helper to build cross-chain deposit message for ft_transfer_call
 */
export function buildDepositMessage(
  companyId: string,
  sourceChain?: string,
  sourceTx?: string
): string {
  let msg = `deposit:${companyId}`;
  if (sourceChain) {
    msg += `:${sourceChain}`;
    if (sourceTx) {
      msg += `:${sourceTx}`;
    }
  }
  return msg;
}

/**
 * Parse withdrawal ID from transaction result
 */
export function parseWithdrawalId(txResult: any): string | null {
  try {
    // Try to extract from receipts/logs
    const logs = txResult.receipts_outcome?.[0]?.outcome?.logs || [];
    for (const log of logs) {
      if (log.includes('Withdrawal initiated:')) {
        const match = log.match(/ID: ([a-f0-9]+)/);
        if (match) {
          return match[1];
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}
