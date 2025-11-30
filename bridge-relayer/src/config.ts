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
  };

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
