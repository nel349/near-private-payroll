/**
 * NEAR Service - wZEC Minting Integration
 */

import { connect, keyStores, Account, utils } from 'near-api-js';
import { WZecToken } from '@near-private-payroll/sdk';
import { DepositEvent, WithdrawalEvent } from '../types';

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
   * Monitor for new burn events (withdrawals)
   * Query recent transactions and look for EVENT_BURN_FOR_ZCASH logs
   */
  async getNewWithdrawals(processedNonces: number[]): Promise<WithdrawalEvent[]> {
    try {
      // Query contract logs for burn events
      // For production, use indexer or streaming API
      // For now, query recent transactions
      const result = await this.account.connection.provider.query({
        request_type: 'view_state',
        finality: 'final',
        account_id: this.wzecContractId,
        prefix_base64: '',
      });

      // In production, you'd use NEAR indexer or streaming API
      // For now, we'll poll using a simple approach
      // The contract emits: log!("EVENT_BURN_FOR_ZCASH:{}", serde_json::to_string(&event))

      // This is a simplified implementation
      // TODO: Implement proper event monitoring using:
      // 1. NEAR Lake indexer
      // 2. WebSocket streaming API
      // 3. Or transaction history queries

      return [];
    } catch (error: any) {
      console.error('Error querying withdrawals:', error.message);
      return [];
    }
  }

  /**
   * Get burn events from transaction outcomes
   * Helper method to parse burn events from NEAR tx receipts
   */
  private parseBurnEvents(logs: string[]): WithdrawalEvent[] {
    const events: WithdrawalEvent[] = [];

    for (const log of logs) {
      if (log.startsWith('EVENT_BURN_FOR_ZCASH:')) {
        try {
          const eventJson = log.substring('EVENT_BURN_FOR_ZCASH:'.length);
          const event = JSON.parse(eventJson);
          events.push(event);
        } catch (error) {
          console.error('Failed to parse burn event:', log, error);
        }
      }
    }

    return events;
  }
}
