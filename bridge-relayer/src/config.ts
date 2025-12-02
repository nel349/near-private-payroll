/**
 * Configuration loader
 */

import { config as dotenvConfig } from 'dotenv';
import { RelayerConfig } from './types';

// Load .env file
dotenvConfig();

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): RelayerConfig {
  const config: RelayerConfig = {
    zcash: {
      rpcHost: process.env.ZCASH_RPC_HOST || '127.0.0.1',
      rpcPort: parseInt(process.env.ZCASH_RPC_PORT || '28232'),
      rpcUser: process.env.ZCASH_RPC_USER || 'zcashrpc',
      rpcPassword: process.env.ZCASH_RPC_PASSWORD || '',
      custodyAccountUuid: process.env.ZCASH_CUSTODY_ACCOUNT_UUID,
    },
    near: {
      network: (process.env.NEAR_NETWORK as 'testnet' | 'mainnet') || 'testnet',
      relayerAccount: process.env.NEAR_RELAYER_ACCOUNT || '',
      wzecContract: process.env.WZEC_CONTRACT || '',
      intentsAdapter: process.env.INTENTS_ADAPTER || '',
    },
    pollInterval: parseInt(process.env.POLL_INTERVAL || '30000'),
    withdrawalPollInterval: parseInt(process.env.WITHDRAWAL_POLL_INTERVAL || process.env.POLL_INTERVAL || '30000'),
  };

  // Optional zcashd configuration (for withdrawals)
  const zcashdEnabled = process.env.ZCASHD_ENABLED === 'true';
  if (zcashdEnabled) {
    config.zcashd = {
      rpcHost: process.env.ZCASHD_RPC_HOST || '127.0.0.1',
      rpcPort: parseInt(process.env.ZCASHD_RPC_PORT || '8233'),
      rpcUser: process.env.ZCASHD_RPC_USER || 'zcashuser',
      rpcPassword: process.env.ZCASHD_RPC_PASSWORD || '',
      enabled: true,
    };

    if (!config.zcashd.rpcPassword) {
      throw new Error('ZCASHD_RPC_PASSWORD is required when ZCASHD_ENABLED=true');
    }
  }

  // Validate required fields
  if (!config.zcash.rpcPassword) {
    throw new Error('ZCASH_RPC_PASSWORD is required');
  }

  if (!config.near.relayerAccount) {
    throw new Error('NEAR_RELAYER_ACCOUNT is required');
  }

  if (!config.near.wzecContract) {
    throw new Error('WZEC_CONTRACT is required');
  }

  if (!config.near.intentsAdapter) {
    throw new Error('INTENTS_ADAPTER is required');
  }

  return config;
}
