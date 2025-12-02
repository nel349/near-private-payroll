/**
 * Type definitions for Zcash Bridge Relayer
 */

/** Zallet RPC Types */

export interface ZalletAccount {
  account_uuid: string;
  account: number; // Account index (0, 1, 2, ...)
  addresses: ZalletAddress[];
}

export interface ZalletAddress {
  diversifier_index: number;
  ua?: string; // Unified address (in z_listaccounts response)
  address?: string; // Full address string (in listaddresses response)
  receiver_types?: string[];
}

export interface ZalletBalance {
  pools: {
    sapling?: {
      valueZat: number;
    };
    orchard?: {
      valueZat: number;
    };
  };
}

export interface ZalletUnspentOutput {
  txid: string;
  address: string;
  value: number; // in ZEC
  confirmations: number;
  memo?: string;
}

export interface ZalletOperationStatus {
  id: string;
  status: 'queued' | 'executing' | 'success' | 'failed' | 'cancelled';
  creation_time: number;
  result?: {
    txids: string[];
  };
  error?: {
    code: number;
    message: string;
  };
}

export interface BlockchainInfo {
  chain: string;
  blocks: number;
  headers?: number;
  bestblockhash?: string;
  difficulty?: number;
  verificationprogress: number;
}

/** Bridge Relayer Types */

export interface RelayerConfig {
  // Zcash configuration (Zallet for deposits)
  zcash: {
    rpcHost: string;
    rpcPort: number;
    rpcUser: string;
    rpcPassword: string;
    custodyAccountUuid?: string; // Optional - will use first account if not set
  };

  // Zcashd configuration (for withdrawals) - optional
  zcashd?: {
    rpcHost: string;
    rpcPort: number;
    rpcUser: string;
    rpcPassword: string;
    enabled: boolean; // Whether to use zcashd for withdrawals
  };

  // NEAR configuration
  near: {
    network: 'testnet' | 'mainnet';
    relayerAccount: string;
    wzecContract: string;
    intentsAdapter: string;
  };

  // Monitoring configuration
  pollInterval: number; // milliseconds
  withdrawalPollInterval?: number; // milliseconds (default: same as pollInterval)
}

export interface RelayerState {
  lastProcessedBlock: number;
  processedTxids: string[];
  processedWithdrawalNonces: number[]; // Track processed withdrawal nonces
  pendingWithdrawals: PendingWithdrawal[];
}

export interface PendingWithdrawal {
  id: string;
  destination: string;
  amount: string; // in ZEC
  nearTxHash: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface DepositEvent {
  txid: string;
  amount: number; // in ZEC
  amountZat: number; // in zatoshis
  memo?: string;
  companyId?: string;
  receiverId: string; // NEAR account
  confirmations: number;
}

export interface WithdrawalEvent {
  burner: string; // NEAR account
  amount: string; // wZEC amount (8 decimals)
  zcash_shielded_address: string;
  nonce: number;
  nearTxHash: string; // NEAR tx that emitted the event
}
