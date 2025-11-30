/**
 * NEAR Service - wZEC Minting Integration
 */

import { connect, keyStores, Account, utils } from 'near-api-js';
import { WZecToken } from '@near-private-payroll/sdk';
import { DepositEvent } from '../types';

export class NearService {
  private account!: Account;
  private wzec!: WZecToken;
  private wzecContractId: string;
  private intentsAdapterId: string;

  constructor(
    private network: 'testnet' | 'mainnet',
    private relayerAccountId: string,
    wzecContractId: string,
    intentsAdapterId: string
  ) {
    this.wzecContractId = wzecContractId;
    this.intentsAdapterId = intentsAdapterId;
  }

  /**
   * Initialize NEAR connection
   */
  async initialize(): Promise<void> {
    const keyStore = new keyStores.UnencryptedFileSystemKeyStore(
      `${process.env.HOME}/.near-credentials`
    );

    const near = await connect({
      networkId: this.network,
      keyStore,
      nodeUrl: `https://rpc.${this.network}.near.org`,
      walletUrl: `https://wallet.${this.network}.near.org`,
      helperUrl: `https://helper.${this.network}.near.org`,
    });

    this.account = await near.account(this.relayerAccountId);
    this.wzec = new WZecToken(this.account, this.wzecContractId);
  }

  /**
   * Test NEAR connection
   */
  async testConnection(): Promise<{ accountId: string; balance: string }> {
    const state = await this.account.state();
    return {
      accountId: this.relayerAccountId,
      balance: utils.format.formatNearAmount(state.amount),
    };
  }

  /**
   * Mint wZEC for a deposit
   */
  async mintForDeposit(deposit: DepositEvent): Promise<void> {
    const amountStr = deposit.amountZat.toString();

    console.log(`  Minting ${amountStr} wZEC units (${deposit.amount} ZEC)...`);

    try {
      await this.wzec.mint(
        deposit.receiverId,
        amountStr,
        deposit.txid
      );
    } catch (error: any) {
      throw new Error(`Minting failed: ${error.message}`);
    }
  }

  /**
   * Get wZEC balance for an account
   */
  async getBalance(accountId: string): Promise<string> {
    return this.wzec.balanceOf(accountId);
  }

  /**
   * Get total wZEC supply
   */
  async getTotalSupply(): Promise<string> {
    return this.wzec.totalSupply();
  }

  /**
   * Query pending withdrawals from intents adapter
   * TODO: Implement once withdrawal monitoring is added
   */
  async getPendingWithdrawals(): Promise<any[]> {
    // Placeholder - will be implemented when withdrawal processing is added
    return [];
  }
}
