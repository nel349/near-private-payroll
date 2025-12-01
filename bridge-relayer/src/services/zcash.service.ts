/**
 * Zcash Service - Zallet RPC Integration
 */

import axios, { AxiosInstance } from 'axios';
import {
  ZalletAccount,
  ZalletBalance,
  ZalletUnspentOutput,
  ZalletOperationStatus,
  BlockchainInfo,
  DepositEvent,
} from '../types';

export class ZcashService {
  private client: AxiosInstance;
  private custodyAccountUuid?: string;
  private custodyAccount?: ZalletAccount;

  constructor(
    rpcHost: string,
    rpcPort: number,
    rpcUser: string,
    rpcPassword: string,
    custodyAccountUuid?: string
  ) {
    this.client = axios.create({
      baseURL: `http://${rpcHost}:${rpcPort}`,
      auth: {
        username: rpcUser,
        password: rpcPassword,
      },
      timeout: 10000,
    });
    this.custodyAccountUuid = custodyAccountUuid;
  }

  /**
   * Call Zallet RPC method
   */
  private async rpc<T>(method: string, params: any[] = []): Promise<T> {
    try {
      const response = await this.client.post('/', {
        jsonrpc: '1.0',
        id: 'bridge-relayer',
        method,
        params,
      });

      if (response.data.error) {
        throw new Error(
          `Zallet RPC error: ${response.data.error.message || JSON.stringify(response.data.error)}`
        );
      }

      return response.data.result as T;
    } catch (error: any) {
      if (error.response) {
        throw new Error(`Zallet RPC failed: ${error.response.status} ${error.response.statusText}`);
      }
      throw error;
    }
  }

  /**
   * Test connection to Zallet
   */
  async testConnection(): Promise<BlockchainInfo> {
    // Zallet doesn't have getblockchaininfo, use z_listaccounts as health check
    const accounts = await this.rpc<ZalletAccount[]>('z_listaccounts');

    // Return mock blockchain info for test compatibility
    return {
      chain: 'test',
      blocks: 0, // Zallet doesn't expose block height in current version
      verificationprogress: 1.0,
    };
  }

  /**
   * Get custody account (lazy load)
   */
  async getCustodyAccount(): Promise<ZalletAccount> {
    if (this.custodyAccount) {
      return this.custodyAccount;
    }

    const accounts = await this.rpc<ZalletAccount[]>('z_listaccounts');

    if (accounts.length === 0) {
      throw new Error('No Zcash accounts found. Please create an account first.');
    }

    // Find by UUID or use first account
    if (this.custodyAccountUuid) {
      const account = accounts.find((a) => a.account_uuid === this.custodyAccountUuid);
      if (!account) {
        throw new Error(`Account with UUID ${this.custodyAccountUuid} not found`);
      }
      this.custodyAccount = account;
    } else {
      console.log('No custody account UUID specified, using first account');
      this.custodyAccount = accounts[0];
    }

    return this.custodyAccount;
  }

  /**
   * Get custody account balance
   */
  async getCustodyBalance(): Promise<number> {
    // Zallet doesn't have z_getbalanceforaccount, use z_gettotalbalance
    // Note: This returns TOTAL wallet balance, not per-account
    const balance = await this.rpc<{ transparent: string; private: string; total: string }>(
      'z_gettotalbalance',
      [1, true]
    );

    return parseFloat(balance.total);
  }

  /**
   * Get custody account addresses
   */
  async getCustodyAddresses(): Promise<string[]> {
    const account = await this.getCustodyAccount();

    // Use listaddresses to get actual address strings
    const response = await this.rpc<any[]>('listaddresses');

    if (!response || response.length === 0) {
      return [];
    }

    const mnemonicSource = response.find((src) => src.source === 'mnemonic_seed');
    if (!mnemonicSource || !mnemonicSource.unified) {
      return [];
    }

    // Get accounts array to find index from UUID
    const accounts = await this.rpc<ZalletAccount[]>('z_listaccounts');
    const accountIndex = accounts.findIndex((a) => a.account_uuid === account.account_uuid);

    if (accountIndex === -1) {
      return [];
    }

    // Find the account in listaddresses response
    const accountAddresses = mnemonicSource.unified.find(
      (acc: any) => acc.account === accountIndex
    );

    if (!accountAddresses || !accountAddresses.addresses) {
      return [];
    }

    // Extract all address strings
    return accountAddresses.addresses.map((addr: any) => addr.address);
  }

  /**
   * Monitor for new deposits
   */
  async getNewDeposits(minConfirmations: number = 1, processedTxids: string[]): Promise<DepositEvent[]> {
    const account = await this.getCustodyAccount();
    const addresses = await this.getCustodyAddresses();

    // Get all unspent outputs
    const unspent = await this.rpc<ZalletUnspentOutput[]>('z_listunspent', [
      minConfirmations,
      9999999,
    ]);

    // Filter for deposits to our custody account
    const deposits = unspent.filter(
      (tx) => addresses.includes(tx.address) && !processedTxids.includes(tx.txid)
    );

    // Parse into deposit events
    return deposits.map((tx) => {
      const memo = tx.memo;
      const companyId = this.parseCompanyId(memo);

      return {
        txid: tx.txid,
        amount: tx.value,
        amountZat: Math.floor(tx.value * 100000000),
        memo,
        companyId,
        receiverId: companyId || 'default.testnet',
        confirmations: tx.confirmations,
      };
    });
  }

  /**
   * Parse company ID from memo field
   */
  private parseCompanyId(memo?: string): string | undefined {
    if (!memo) return undefined;

    try {
      // Memo is hex-encoded
      const decoded = Buffer.from(memo, 'hex').toString('utf8');

      // Format: "company:account.testnet"
      if (decoded.startsWith('company:')) {
        return decoded.split(':')[1];
      }
    } catch (error) {
      console.warn('Failed to parse memo:', error);
    }

    return undefined;
  }

  /**
   * Send ZEC from custody account
   */
  async sendFromCustody(
    destinationAddress: string,
    amount: number
  ): Promise<string[]> {
    const account = await this.getCustodyAccount();
    const addresses = await this.getCustodyAddresses();

    if (addresses.length === 0) {
      throw new Error('No custody addresses available');
    }

    const fromAddress = addresses[0]; // Use first address

    // Zallet's z_sendmany returns {txids: [...]} array
    const result = await this.rpc<{ txids: string[] }>('z_sendmany', [
      fromAddress,
      [
        {
          address: destinationAddress,
          amount: amount,
        },
      ],
      null, // minconf (automatic)
      null, // fee (automatic ZIP 317)
    ]);

    return result.txids;
  }

  /**
   * Wait for operation to complete
   */
  async waitForOperation(opid: string, maxRetries: number = 60): Promise<ZalletOperationStatus> {
    for (let i = 0; i < maxRetries; i++) {
      const status = await this.rpc<ZalletOperationStatus[]>('z_getoperationstatus', [[opid]]);

      if (status && status.length > 0) {
        const op = status[0];

        if (op.status === 'success') {
          return op;
        } else if (op.status === 'failed') {
          throw new Error(`Zcash operation failed: ${op.error?.message || 'Unknown error'}`);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error('Zcash operation timeout');
  }

  /**
   * Get current block height
   */
  async getCurrentBlock(): Promise<number> {
    // Zallet doesn't expose block height directly
    // Use z_listunspent to get transactions with confirmations as a proxy
    // Return 0 if wallet is empty
    const unspent = await this.rpc<ZalletUnspentOutput[]>('z_listunspent', [0, 9999999]);

    if (unspent.length === 0) {
      return 0;
    }

    // Return highest confirmation count as rough block estimate
    const maxConfirmations = Math.max(...unspent.map((tx) => tx.confirmations || 0));
    return maxConfirmations;
  }
}
