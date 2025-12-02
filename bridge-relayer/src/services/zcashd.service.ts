/**
 * Zcashd Service - zcashd RPC Integration
 *
 * Supports zcashd (production Zcash wallet) for sending ZEC with memos
 */

import axios, { AxiosInstance } from 'axios';

export class ZcashdService {
  private client: AxiosInstance;

  constructor(
    rpcHost: string,
    rpcPort: number,
    rpcUser: string,
    rpcPassword: string
  ) {
    this.client = axios.create({
      baseURL: `http://${rpcHost}:${rpcPort}`,
      auth: {
        username: rpcUser,
        password: rpcPassword,
      },
      timeout: 30000, // Longer timeout for z_sendmany
    });
  }

  /**
   * Call zcashd RPC method
   */
  private async rpc<T>(method: string, params: any[] = []): Promise<T> {
    try {
      const response = await this.client.post('', {
        jsonrpc: '1.0',
        id: 'bridge-relayer',
        method,
        params,
      });

      if (response.data.error) {
        throw new Error(
          `zcashd RPC error: ${response.data.error.message || JSON.stringify(response.data.error)}`
        );
      }

      return response.data.result as T;
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(`zcashd RPC error: ${error.response.data.error.message}`);
      }
      throw error;
    }
  }

  /**
   * Test connection to zcashd
   */
  async testConnection(): Promise<{ version: number; blocks: number }> {
    const info = await this.rpc<any>('getinfo');
    return {
      version: info.version,
      blocks: info.blocks,
    };
  }

  /**
   * Get the first shielded address from the wallet
   */
  async getCustodyAddress(): Promise<string> {
    const addresses = await this.rpc<string[]>('z_listaddresses');

    if (addresses.length === 0) {
      throw new Error('No shielded addresses found in zcashd wallet');
    }

    return addresses[0];
  }

  /**
   * Send ZEC from custody account to a destination address
   * @param fromAddress - Source shielded address (from custody wallet)
   * @param toAddress - Destination shielded address
   * @param amount - Amount in ZEC (decimal)
   * @returns Operation ID
   */
  async sendZec(
    fromAddress: string,
    toAddress: string,
    amount: number
  ): Promise<string> {
    // z_sendmany format: z_sendmany "fromaddress" [{"address":... ,"amount":...}]
    const recipients = [
      {
        address: toAddress,
        amount: amount,
      },
    ];

    console.log(`  Sending ${amount} ZEC from ${fromAddress.substring(0, 20)}...`);
    console.log(`           to ${toAddress.substring(0, 20)}...`);

    // Call z_sendmany (returns operation ID)
    const opid = await this.rpc<string>('z_sendmany', [fromAddress, recipients]);

    return opid;
  }

  /**
   * Wait for a z_sendmany operation to complete
   * @param opid - Operation ID from z_sendmany
   * @param maxRetries - Maximum number of retries (default 60 = 60 seconds)
   * @returns Transaction ID
   */
  async waitForOperation(opid: string, maxRetries: number = 60): Promise<string> {
    for (let i = 0; i < maxRetries; i++) {
      const result = await this.rpc<any[]>('z_getoperationstatus', [[opid]]);

      if (result.length === 0) {
        throw new Error(`Operation ${opid} not found`);
      }

      const op = result[0];

      if (op.status === 'success') {
        return op.result.txid;
      } else if (op.status === 'failed') {
        throw new Error(`Operation failed: ${op.error?.message || 'Unknown error'}`);
      }

      // Still executing, wait 1 second
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`Operation ${opid} timed out after ${maxRetries} seconds`);
  }

  /**
   * Get total shielded balance
   */
  async getTotalBalance(): Promise<number> {
    const balance = await this.rpc<{ transparent: string; private: string; total: string }>(
      'z_gettotalbalance'
    );
    return parseFloat(balance.total);
  }

  /**
   * Get blockchain sync info
   */
  async getBlockchainInfo(): Promise<{ blocks: number; headers: number; progress: number }> {
    const info = await this.rpc<any>('getblockchaininfo');
    return {
      blocks: info.blocks,
      headers: info.headers,
      progress: info.verificationprogress,
    };
  }
}
