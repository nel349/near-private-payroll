/**
 * NEAR Private Payroll - Contract Configuration
 *
 * Infrastructure contract addresses for different networks.
 * These are the shared contracts (tokens, verifiers, bridges).
 * Each company deploys their own payroll contract.
 */

export interface NetworkConfig {
  networkId: 'testnet' | 'mainnet';
  nodeUrl: string;
  walletUrl: string;
  helperUrl: string;
  explorerUrl: string;

  // Infrastructure contracts
  wzecToken: string;
  zkVerifier: string;
  payrollFactory: string;    // Factory contract for deploying payroll contracts
  intentsAdapter?: string;
  poaToken?: string;
  nearIntents?: string;

  // Deployment settings (legacy - not used with factory)
  wasmUrl: string;
}

/**
 * Testnet configuration
 */
export const TESTNET_CONFIG: NetworkConfig = {
  networkId: 'testnet',
  nodeUrl: 'https://rpc.testnet.near.org',
  walletUrl: 'https://testnet.mynearwallet.com/',
  helperUrl: 'https://helper.testnet.near.org',
  explorerUrl: 'https://testnet.nearblocks.io',

  // TODO: Deploy these contracts to testnet
  wzecToken: 'wzec.nel349.testnet',
  zkVerifier: 'verifier.nel349.testnet',
  payrollFactory: 'payroll-factory.nel349.testnet',  // Factory for deploying company contracts
  intentsAdapter: 'intents.nel349.testnet', // NEAR Intents adapter for non-custodial cross-chain
  poaToken: undefined, // Optional: for NEAR Intents (mainnet only)
  nearIntents: undefined, // Optional: for DeFi features (mainnet only)

  // WASM file location (legacy - not used with factory)
  wasmUrl: '/contracts/payroll.wasm',
};

/**
 * Mainnet configuration
 */
export const MAINNET_CONFIG: NetworkConfig = {
  networkId: 'mainnet',
  nodeUrl: 'https://rpc.mainnet.near.org',
  walletUrl: 'https://app.mynearwallet.com/',
  helperUrl: 'https://helper.mainnet.near.org',
  explorerUrl: 'https://nearblocks.io',

  // TODO: Deploy these contracts to mainnet
  wzecToken: 'wzec.near',
  zkVerifier: 'verifier.near',
  payrollFactory: 'payroll-factory.near',  // Factory for deploying company contracts
  intentsAdapter: 'intents-adapter.near',
  poaToken: 'zec.omft.near', // PoA Bridge ZEC token
  nearIntents: 'intents.near', // NEAR Intents protocol

  // WASM file location (legacy - not used with factory)
  wasmUrl: '/contracts/payroll.wasm',
};

/**
 * Get configuration for current network
 */
export function getConfig(networkId: 'testnet' | 'mainnet' = 'testnet'): NetworkConfig {
  return networkId === 'mainnet' ? MAINNET_CONFIG : TESTNET_CONFIG;
}

/**
 * Default network (change this for production)
 */
export const DEFAULT_NETWORK: 'testnet' | 'mainnet' = 'testnet';

/**
 * Get current network config
 */
export const CONFIG = getConfig(DEFAULT_NETWORK);
