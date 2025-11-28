/**
 * Test Setup for NEAR Private Payroll
 *
 * Provides utilities for spinning up sandbox environment with deployed contracts
 */

import { Worker, parseNEAR } from 'near-workspaces';
import type { NearAccount } from 'near-workspaces';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Contract paths
const PAYROLL_WASM = path.join(__dirname, '../target/near/payroll_contract/payroll_contract.wasm');
const ZK_VERIFIER_WASM = path.join(__dirname, '../target/near/zk_verifier/zk_verifier.wasm');
const WZEC_TOKEN_WASM = path.join(__dirname, '../target/near/wzec_token/wzec_token.wasm');
const INTENTS_ADAPTER_WASM = path.join(__dirname, '../target/near/intents_adapter/intents_adapter.wasm');

// Alternative paths (wasm32-unknown-unknown target)
const PAYROLL_WASM_ALT = path.join(__dirname, '../target/wasm32-unknown-unknown/release/payroll_contract.wasm');
const ZK_VERIFIER_WASM_ALT = path.join(__dirname, '../target/wasm32-unknown-unknown/release/zk_verifier.wasm');
const WZEC_TOKEN_WASM_ALT = path.join(__dirname, '../target/wasm32-unknown-unknown/release/wzec_token.wasm');
const INTENTS_ADAPTER_WASM_ALT = path.join(__dirname, '../target/wasm32-unknown-unknown/release/intents_adapter.wasm');

import fs from 'fs';

/**
 * Get the correct wasm path (tries both build targets)
 */
function getWasmPath(primary: string, alt: string): string {
  if (fs.existsSync(primary)) return primary;
  if (fs.existsSync(alt)) return alt;
  throw new Error(`WASM file not found: ${primary} or ${alt}`);
}

/**
 * Test context with deployed contracts and accounts
 */
export interface TestContext {
  worker: Worker;
  root: NearAccount;

  // Contracts
  payroll: NearAccount;
  zkVerifier: NearAccount;
  wzecToken: NearAccount;
  intentsAdapter: NearAccount;

  // Accounts
  owner: NearAccount;
  company: NearAccount;
  employee1: NearAccount;
  employee2: NearAccount;
  employee3: NearAccount;
  verifier: NearAccount; // e.g., bank, landlord
  bridgeRelayer: NearAccount; // For cross-chain operations
}

/**
 * Supported destination chains (matches contract)
 */
export const DestinationChain = {
  Zcash: 'Zcash',
  Solana: 'Solana',
  Ethereum: 'Ethereum',
  Bitcoin: 'Bitcoin',
  Near: 'Near',
} as const;

export type DestinationChain = typeof DestinationChain[keyof typeof DestinationChain];

/**
 * Mock Zcash addresses for testing
 */
export const MOCK_ZCASH_ADDRESSES = {
  // Shielded addresses (recommended for privacy)
  shielded1: 'zs1j29m7zdmh0s2k2c2fqjcpxlqm9uvr9q3r5xeqf1234567890abcdef1234567890abcdef12',
  shielded2: 'zs1k38n8aeni1t3l3d3grjdylrn0wus9r4s6xfqg2345678901bcdef2345678901bcdef23',
  // Transparent addresses (less private)
  transparent1: 't1KstHrDrZiYTx8XQMcjPrFkBqCqS1Dz4bC',
  transparent2: 't3Vz22vK5z8LcuQKvcreMJC1Mw8QbCNPZvn',
};

/**
 * Mock addresses for other chains
 */
export const MOCK_ADDRESSES = {
  solana: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
  ethereum: '0x742d35Cc6634C0532925a3b844Bc9e7595f8e123',
  bitcoin: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
};

/**
 * Initialize test environment with all contracts deployed
 */
export async function initTestContext(): Promise<TestContext> {
  const worker = await Worker.init();
  const root = worker.rootAccount;

  // Create accounts
  const owner = await root.createSubAccount('owner', { initialBalance: BigInt(parseNEAR('100')) });
  const company = await root.createSubAccount('company', { initialBalance: BigInt(parseNEAR('100')) });
  const employee1 = await root.createSubAccount('employee1', { initialBalance: BigInt(parseNEAR('10')) });
  const employee2 = await root.createSubAccount('employee2', { initialBalance: BigInt(parseNEAR('10')) });
  const employee3 = await root.createSubAccount('employee3', { initialBalance: BigInt(parseNEAR('10')) });
  const verifier = await root.createSubAccount('verifier', { initialBalance: BigInt(parseNEAR('10')) });
  const bridgeRelayer = await root.createSubAccount('relayer', { initialBalance: BigInt(parseNEAR('10')) });

  // Get wasm paths (tries both build targets)
  const payrollWasm = getWasmPath(PAYROLL_WASM, PAYROLL_WASM_ALT);
  const zkVerifierWasm = getWasmPath(ZK_VERIFIER_WASM, ZK_VERIFIER_WASM_ALT);
  const wzecTokenWasm = getWasmPath(WZEC_TOKEN_WASM, WZEC_TOKEN_WASM_ALT);
  const intentsAdapterWasm = getWasmPath(INTENTS_ADAPTER_WASM, INTENTS_ADAPTER_WASM_ALT);

  // Deploy ZK Verifier
  const zkVerifier = await root.createSubAccount('zkverifier', { initialBalance: BigInt(parseNEAR('50')) });
  await zkVerifier.deploy(zkVerifierWasm);
  await zkVerifier.call(zkVerifier, 'new', { owner: owner.accountId });

  // Deploy wZEC Token
  const wzecToken = await root.createSubAccount('wzec', { initialBalance: BigInt(parseNEAR('50')) });
  await wzecToken.deploy(wzecTokenWasm);
  await wzecToken.call(wzecToken, 'new', {
    owner: owner.accountId,
    bridge_controller: owner.accountId, // For testing, owner is also bridge controller
  });

  // Deploy Payroll Contract
  const payroll = await root.createSubAccount('payroll', { initialBalance: BigInt(parseNEAR('50')) });
  await payroll.deploy(payrollWasm);
  await payroll.call(payroll, 'new', {
    owner: owner.accountId,
    wzec_token: wzecToken.accountId,
    zk_verifier: zkVerifier.accountId,
  });

  // Deploy Intents Adapter
  const intentsAdapter = await root.createSubAccount('intents', { initialBalance: BigInt(parseNEAR('50')) });
  await intentsAdapter.deploy(intentsAdapterWasm);
  await intentsAdapter.call(intentsAdapter, 'new', {
    owner: owner.accountId,
    payroll_contract: payroll.accountId,
    wzec_token: wzecToken.accountId,
    intents_contract: null, // Use default (intents.near) - mocked in tests
  });

  // Configure payroll to use intents adapter
  await owner.call(payroll, 'set_intents_adapter', {
    intents_adapter: intentsAdapter.accountId,
  });

  // Add bridge relayer as authorized
  await owner.call(intentsAdapter, 'add_relayer', {
    relayer: bridgeRelayer.accountId,
  });

  return {
    worker,
    root,
    payroll,
    zkVerifier,
    wzecToken,
    intentsAdapter,
    owner,
    company,
    employee1,
    employee2,
    employee3,
    verifier,
    bridgeRelayer,
  };
}

/**
 * Clean up test environment
 */
export async function cleanupTestContext(ctx: TestContext): Promise<void> {
  await ctx.worker.tearDown();
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Convert string to bytes32 (padded/truncated)
 */
export function stringToBytes32(str: string): number[] {
  const bytes = Buffer.from(str, 'utf8');
  const result = new Array(32).fill(0);
  for (let i = 0; i < Math.min(bytes.length, 32); i++) {
    result[i] = bytes[i];
  }
  return result;
}

/**
 * Create a random bytes32
 */
export function randomBytes32(): number[] {
  const result = new Array(32);
  for (let i = 0; i < 32; i++) {
    result[i] = Math.floor(Math.random() * 256);
  }
  return result;
}

/**
 * Create a Pedersen commitment (simplified - uses SHA256)
 * In production, this should match the circuit's commitment scheme
 */
export function computeCommitment(value: bigint, blinding: number[]): number[] {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hash.update(Buffer.from('near-private-payroll:commitment:v1'));
  hash.update(Buffer.from(bigintToLeBytes(value)));
  hash.update(Buffer.from(blinding));
  const result = hash.digest();
  return Array.from(result);
}

/**
 * Convert bigint to little-endian bytes
 */
export function bigintToLeBytes(n: bigint, length = 8): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Number(n & 0xFFn);
    n >>= 8n;
  }
  return bytes;
}

/**
 * Compute history commitment from payment commitments
 */
export function computeHistoryCommitment(paymentCommitments: number[][]): number[] {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hash.update(Buffer.from('near-private-payroll:history:v1'));
  for (const commitment of paymentCommitments) {
    hash.update(Buffer.from(commitment));
  }
  return Array.from(hash.digest());
}

/**
 * Create a mock RISC Zero receipt (for DevMode testing)
 * Format: image_id (32) + proof_data (256) + journal (variable)
 */
export function createMockReceipt(
  imageId: number[],
  journal: number[]
): number[] {
  // In DevMode, we just need valid format - crypto is skipped
  const mockProof = new Array(256).fill(0);
  return [...imageId, ...mockProof, ...journal];
}

/**
 * Create income threshold journal
 * Format: threshold (8) + meets_threshold (1) + payment_count (4) + history_commitment (32)
 */
export function createIncomeThresholdJournal(
  threshold: bigint,
  meetsThreshold: boolean,
  paymentCount: number,
  historyCommitment: number[]
): number[] {
  const thresholdBytes = Array.from(bigintToLeBytes(threshold, 8));
  const meetsBytes = [meetsThreshold ? 1 : 0];
  const countBytes = Array.from(bigintToLeBytes(BigInt(paymentCount), 4));
  return [...thresholdBytes, ...meetsBytes, ...countBytes, ...historyCommitment];
}

/**
 * Create income range journal
 * Format: min (8) + max (8) + in_range (1) + payment_count (4) + history_commitment (32)
 */
export function createIncomeRangeJournal(
  min: bigint,
  max: bigint,
  inRange: boolean,
  paymentCount: number,
  historyCommitment: number[]
): number[] {
  const minBytes = Array.from(bigintToLeBytes(min, 8));
  const maxBytes = Array.from(bigintToLeBytes(max, 8));
  const inRangeBytes = [inRange ? 1 : 0];
  const countBytes = Array.from(bigintToLeBytes(BigInt(paymentCount), 4));
  return [...minBytes, ...maxBytes, ...inRangeBytes, ...countBytes, ...historyCommitment];
}

/**
 * Create credit score journal
 * Format: threshold (4) + meets_threshold (1) + payment_count (4) + history_commitment (32)
 */
export function createCreditScoreJournal(
  threshold: number,
  meetsThreshold: boolean,
  paymentCount: number,
  historyCommitment: number[]
): number[] {
  const thresholdBytes = Array.from(bigintToLeBytes(BigInt(threshold), 4));
  const meetsBytes = [meetsThreshold ? 1 : 0];
  const countBytes = Array.from(bigintToLeBytes(BigInt(paymentCount), 4));
  return [...thresholdBytes, ...meetsBytes, ...countBytes, ...historyCommitment];
}

// ==================== PROOF TYPES ====================

export const IncomeProofType = {
  AboveThreshold: 'AboveThreshold',
  InRange: 'InRange',
  AverageAboveThreshold: 'AverageAboveThreshold',
  CreditScore: 'CreditScore',
} as const;

export const DisclosureType = {
  Employment: 'Employment',
  IncomeThreshold: 'IncomeThreshold',
  IncomeRange: 'IncomeRange',
  PaymentHistory: 'PaymentHistory',
  FullAudit: 'FullAudit',
} as const;

// ==================== IMAGE IDS ====================

// Mock image IDs for testing (in production, these come from compiled circuits)
export const MOCK_IMAGE_IDS = {
  IncomeThreshold: new Array(32).fill(1),
  IncomeRange: new Array(32).fill(2),
  AverageIncome: new Array(32).fill(3),
  CreditScore: new Array(32).fill(4),
  PaymentProof: new Array(32).fill(5),
};

// ==================== PROOF SERVER MANAGEMENT ====================

const PROOF_SERVER_URL = 'http://localhost:3000';
const PROOF_SERVER_BINARY = path.join(__dirname, '../target/release/proof-server');

/**
 * Check if proof server is running
 */
export async function isProofServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${PROOF_SERVER_URL}/health`, {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Start proof server if not already running
 * Returns true if started, false if already running
 */
export async function ensureProofServerRunning(): Promise<boolean> {
  if (await isProofServerRunning()) {
    return false; // Already running
  }

  console.log('Starting proof-server...');

  // Start proof server in background
  const { spawn } = await import('child_process');
  const proofServer = spawn(PROOF_SERVER_BINARY, [], {
    detached: true,
    stdio: 'ignore',
  });

  proofServer.unref(); // Allow parent to exit independently

  // Wait for proof server to be ready (up to 10 seconds)
  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    if (await isProofServerRunning()) {
      console.log('✓ Proof server started successfully');
      return true;
    }
  }

  throw new Error('Proof server failed to start within 10 seconds');
}
