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

    // Use recommended RPC endpoint (rpc.near.org is deprecated)
    const nodeUrl = this.network === 'testnet'
      ? 'https://rpc.testnet.fastnear.com'
      : 'https://rpc.mainnet.fastnear.com';

    const near = await connect({
      networkId: this.network,
      keyStore,
      nodeUrl,
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
   * Mints to relayer, then transfers to payroll contract with "deposit" message
   */
  async mintForDeposit(deposit: DepositEvent): Promise<void> {
    const amountStr = deposit.amountZat.toString();

    console.log(`  Minting ${amountStr} wZEC units (${deposit.amount} ZEC) to relayer...`);

    try {
      // Step 1: Mint to relayer account
      await this.wzec.mint(
        this.relayerAccountId,
        amountStr,
        deposit.txid
      );

      console.log(`  Registering ${deposit.receiverId} with wZEC token if needed...`);

      // Step 2: Ensure payroll contract is registered with wZEC
      try {
        await this.wzec.storageDeposit(deposit.receiverId);
        console.log(`  ✅ Registered ${deposit.receiverId} with wZEC`);
      } catch (error: any) {
        // Ignore if already registered
        if (!error.message.includes('already registered')) {
          console.warn(`  Warning: Storage deposit failed: ${error.message}`);
        }
      }

      console.log(`  Depositing ${amountStr} wZEC to payroll contract ${deposit.receiverId}...`);

      // Step 3: Transfer to payroll contract with "deposit" message
      await this.wzec.transferCall(
        deposit.receiverId,
        amountStr,
        "deposit",
        `Deposit from bridge for txid: ${deposit.txid}`
      );

      console.log(`  ✅ Successfully deposited ${deposit.amount} ZEC to ${deposit.receiverId}`);
    } catch (error: any) {
      throw new Error(`Deposit failed: ${error.message}`);
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
   * Queries on-chain withdrawal requests stored by the contract
   */
  async getNewWithdrawals(processedNonces: number[]): Promise<WithdrawalEvent[]> {
    try {
      const withdrawals: WithdrawalEvent[] = [];

      // Get current nonce
      console.log('  📊 Querying current withdrawal nonce...');
      const currentNonce = await this.wzec.getWithdrawalNonce();
      console.log(`  📊 Current nonce: ${currentNonce}`);
      const lastProcessedNonce = processedNonces.length > 0
        ? Math.max(...processedNonces)
        : 0;

      if (currentNonce > 0 && currentNonce > lastProcessedNonce) {
        console.log(`  🔥 Detected ${currentNonce - lastProcessedNonce} new withdrawal(s)`);

        // Query each unprocessed withdrawal request
        for (let nonce = lastProcessedNonce + 1; nonce <= currentNonce; nonce++) {
          try {
            console.log(`    🔍 Querying withdrawal request ${nonce}...`);
            const request = await this.wzec.getWithdrawalRequest(nonce);
            console.log(`    ✅ Got withdrawal ${nonce}:`, request ? 'found' : 'null');

            if (request && request.zcash_shielded_address) {
              console.log(`    • Withdrawal ${nonce}: ${request.amount} wZEC → ${request.zcash_shielded_address.substring(0, 20)}...`);

              withdrawals.push({
                burner: request.burner,
                amount: request.amount,
                zcash_shielded_address: request.zcash_shielded_address,
                nonce: request.nonce,
                nearTxHash: '', // Will be populated by relayer
              });
            } else {
              console.warn(`    ⚠️  Warning: Withdrawal request ${nonce} not found on-chain`);
            }
          } catch (error: any) {
            console.warn(`    ⚠️  Error querying withdrawal ${nonce}:`, error.message);
            console.warn(`    Stack:`, error.stack);
          }
        }
      }

      return withdrawals;
    } catch (error: any) {
      console.error('Error querying withdrawals:', error.message);
      console.error('Stack:', error.stack);
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
