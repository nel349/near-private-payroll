/**
 * wZEC Token Contract Interface
 */

import { Contract, Account, transactions } from 'near-api-js';

/** Withdrawal request stored on-chain */
export interface WithdrawalRequest {
  burner: string;
  amount: string;
  zcash_shielded_address: string;
  nonce: number;
  timestamp: string;
}

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
  storage_deposit: (args: {
    account_id?: string;
    registration_only?: boolean;
  }) => Promise<void>;

  // View methods
  get_bridge_controller: () => Promise<string>;
  get_total_locked_zec: () => Promise<string>;
  get_withdrawal_nonce: () => Promise<number>;
  get_owner: () => Promise<string>;
  get_withdrawal_request: (args: { nonce: number }) => Promise<WithdrawalRequest | null>;
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
        'get_withdrawal_request',
      ],
      changeMethods: [
        'mint',
        'burn_for_zcash',
        'update_bridge_controller',
        'transfer_ownership',
        'ft_transfer',
        'ft_transfer_call',
        'storage_deposit',
      ],
      useLocalViewExecution: false,
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
    // Use transactions.functionCall for proper arg encoding
    const argsObj = {
      receiver_id: receiverId,
      amount,
      zcash_tx_hash: zcashTxHash,
    };

    console.log('Minting with args:', JSON.stringify(argsObj));
    const args = Buffer.from(JSON.stringify(argsObj));
    console.log('Args buffer length:', args.length);

    await this.account.signAndSendTransaction({
      receiverId: this.contract.contractId,
      actions: [
        transactions.functionCall(
          'mint',
          args,
          BigInt('300000000000000'),
          BigInt('1')
        ),
      ],
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
    // Mainnet: zs (Sapling), zc (Sprout), u1 (Unified)
    // Testnet: ztestsapling, utest (Unified/Sapling)
    if (
      !zcashShieldedAddress.startsWith('zs') &&
      !zcashShieldedAddress.startsWith('zc') &&
      !zcashShieldedAddress.startsWith('u1') &&
      !zcashShieldedAddress.startsWith('ztestsapling') &&
      !zcashShieldedAddress.startsWith('utest')
    ) {
      throw new Error('Invalid Zcash shielded address');
    }

    await this.account.functionCall({
      contractId: this.contract.contractId,
      methodName: 'burn_for_zcash',
      args: {
        amount,
        zcash_shielded_address: zcashShieldedAddress,
      },
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
    // Use account.functionCall for proper new-style API
    const result = await this.account.functionCall({
      contractId: this.contract.contractId,
      methodName: 'ft_transfer_call',
      args: {
        receiver_id: receiverId,
        amount,
        msg,
        memo,
      },
      gas: BigInt('300000000000000'), // 300 TGas
      attachedDeposit: BigInt('1'), // 1 yoctoNEAR
    });

    return result.transaction.hash;
  }

  /**
   * Deposit wZEC to payroll contract
   * Convenience method for transferCall with "deposit" message
   */
  async depositToPayroll(payrollContractId: string, amount: string): Promise<string> {
    return this.transferCall(payrollContractId, amount, 'deposit');
  }

  /**
   * Register an account with the wZEC token
   * Required before account can receive wZEC (NEP-141 storage deposit)
   *
   * @param accountId - Account to register (defaults to caller)
   * @param registrationOnly - If true, only covers storage for registration (default)
   */
  async storageDeposit(
    accountId?: string,
    registrationOnly: boolean = true
  ): Promise<void> {
    await this.account.functionCall({
      contractId: this.contract.contractId,
      methodName: 'storage_deposit',
      args: {
        account_id: accountId,
        registration_only: registrationOnly,
      },
      gas: BigInt('30000000000000'), // 30 TGas
      attachedDeposit: BigInt('1250000000000000000000'), // 0.00125 NEAR
    });
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

  /**
   * Get withdrawal request by nonce
   * Note: This method returns Borsh-serialized data from the contract
   */
  async getWithdrawalRequest(nonce: number): Promise<WithdrawalRequest | null> {
    try {
      // Call the view method directly to get raw result
      const result: any = await this.account.connection.provider.query({
        request_type: 'call_function',
        account_id: this.contract.contractId,
        method_name: 'get_withdrawal_request',
        args_base64: Buffer.from(JSON.stringify({ nonce })).toString('base64'),
        finality: 'final',
      });

      // If result is empty or first byte is 0 (None variant), return null
      if (!result.result || result.result.length === 0 || result.result[0] === 0) {
        return null;
      }

      // Borsh encodes Option<T> as: 1 byte (0=None, 1=Some) + T data
      // Skip the first byte (which is 1 for Some) and manually parse the struct
      const data = Buffer.from(result.result).slice(1);

      // Manually parse Borsh-encoded WithdrawalRequest
      // Borsh encodes strings as: u32 length + UTF-8 bytes
      // Borsh encodes u64 as: 8 bytes little-endian
      let offset = 0;

      // Helper to safely read string
      const readString = (): string => {
        if (offset + 4 > data.length) {
          throw new Error(`Cannot read string length at offset ${offset}, buffer size: ${data.length}`);
        }
        const len = data.readUInt32LE(offset);
        offset += 4;
        if (offset + len > data.length) {
          throw new Error(`Cannot read string of length ${len} at offset ${offset}, buffer size: ${data.length}`);
        }
        const str = data.toString('utf-8', offset, offset + len);
        offset += len;
        return str;
      };

      // Parse burner (AccountId - string)
      const burner = readString();

      // Parse amount (U128 - serialized as u128, 16 bytes little-endian)
      if (offset + 16 > data.length) {
        throw new Error(`Cannot read amount at offset ${offset}, buffer size: ${data.length}`);
      }
      // Read as BigInt from 16 bytes (u128)
      const amountLow = data.readBigUInt64LE(offset);
      const amountHigh = data.readBigUInt64LE(offset + 8);
      // Combine into full u128 value (for amounts < 2^64, high is 0)
      const amount = (amountHigh === BigInt(0))
        ? amountLow.toString()
        : (amountHigh * (BigInt(1) << BigInt(64)) + amountLow).toString();
      offset += 16;

      // Parse zcash_shielded_address (string)
      const zcash_shielded_address = readString();

      // Parse nonce (u64)
      if (offset + 8 > data.length) {
        throw new Error(`Cannot read nonce at offset ${offset}, buffer size: ${data.length}`);
      }
      const requestNonce = Number(data.readBigUInt64LE(offset));
      offset += 8;

      // Parse timestamp (u64)
      if (offset + 8 > data.length) {
        throw new Error(`Cannot read timestamp at offset ${offset}, buffer size: ${data.length}`);
      }
      const timestamp = data.readBigUInt64LE(offset).toString();

      return {
        burner,
        amount,
        zcash_shielded_address,
        nonce: requestNonce,
        timestamp,
      };
    } catch (error: any) {
      console.error('Error fetching withdrawal request:', error.message);
      return null;
    }
  }
}
