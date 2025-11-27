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

  // Accounts
  owner: NearAccount;
  company: NearAccount;
  employee1: NearAccount;
  employee2: NearAccount;
  employee3: NearAccount;
  verifier: NearAccount; // e.g., bank, landlord
}

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

  // Deploy contracts
  const zkVerifier = await root.createSubAccount('zkverifier', { initialBalance: BigInt(parseNEAR('50')) });
  await zkVerifier.deploy(ZK_VERIFIER_WASM);
  await zkVerifier.call(zkVerifier, 'new', { owner: owner.accountId });

  const wzecToken = await root.createSubAccount('wzec', { initialBalance: BigInt(parseNEAR('50')) });
  await wzecToken.deploy(WZEC_TOKEN_WASM);
  await wzecToken.call(wzecToken, 'new', {
    owner: owner.accountId,
    bridge_controller: owner.accountId, // For testing, owner is also bridge controller
  });

  const payroll = await root.createSubAccount('payroll', { initialBalance: BigInt(parseNEAR('50')) });
  await payroll.deploy(PAYROLL_WASM);
  await payroll.call(payroll, 'new', {
    owner: owner.accountId,
    wzec_token: wzecToken.accountId,
    zk_verifier: zkVerifier.accountId,
  });

  return {
    worker,
    root,
    payroll,
    zkVerifier,
    wzecToken,
    owner,
    company,
    employee1,
    employee2,
    employee3,
    verifier,
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
