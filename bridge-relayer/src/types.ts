/**
 * Type definitions for Zcash Bridge Relayer
 */

/** Zallet RPC Types */

export interface ZalletAccount {
  account_uuid: string;
  has_spending_key: boolean;
  addresses: ZalletAddress[];
}

export interface ZalletAddress {
  diversifier_index: number;
  address?: string;
  receiver_types: string[];
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
  headers: number;
  bestblockhash: string;
  difficulty: number;
  verificationprogress: number;
}

/** Bridge Relayer Types */

export interface RelayerConfig {
  // Zcash configuration
  zcash: {
    rpcHost: string;
    rpcPort: number;
    rpcUser: string;
    rpcPassword: string;
    custodyAccountUuid?: string; // Optional - will use first account if not set
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
}

export interface RelayerState {
  lastProcessedBlock: number;
  processedTxids: string[];
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
