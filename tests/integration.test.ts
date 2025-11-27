/**
 * Integration Tests - Real Proof Generation with Proof Server
 *
 * These tests use REAL Groth16 proofs and verification:
 *   1. Load real RISC Zero verification key from risc0_vk.json
 *   2. Register real image IDs from circuit ELFs
 *   3. Generate real Groth16 proofs via proof-server
 *   4. Verify proofs on-chain using NEAR's alt_bn128 precompiles
 *
 * Requirements:
 *   - Circuits built: ./scripts/build-circuits.sh
 *   - Proof server running: cargo run -p proof-server (with or without DEV_MODE)
 *
 * DEV_MODE=false: Real Groth16 proofs (~2 min generation, verification should PASS)
 * DEV_MODE=true: Mock proofs (instant, verification will FAIL but tests still useful)
 */

import test from 'ava';
import { Worker, parseNEAR } from 'near-workspaces';
import type { NearAccount } from 'near-workspaces';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { ensureProofServerRunning } from './setup.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROOF_SERVER_URL = process.env.PROOF_SERVER_URL || 'http://localhost:3000';

// Helper to parse NEAR amount to bigint
const parseNEARAmount = (amount: string): bigint => BigInt(parseNEAR(amount));

// Load real RISC Zero verification key
// NOTE: Contract expects hex strings (has custom deserializer), not byte arrays!
function loadVerificationKey() {
  const vkPath = path.join(__dirname, '..', 'scripts', 'risc0_vk.json');
  const vkJson = readFileSync(vkPath, 'utf-8');
  const vk = JSON.parse(vkJson);

  // Return as-is - contract has custom hex_serde deserializer
  return vk;
}

// Load circuit image IDs
// Note: These are computed from circuit ELFs via compute_image_id()
// Run: cargo test -p proof-server --test compute_image_ids -- --nocapture
// to regenerate if circuits change
function getImageIds() {
  // Try to load from a JSON file if it exists, otherwise use fallback
  const imageIdsPath = path.join(__dirname, '..', 'scripts', 'image_ids.json');

  try {
    const imageIdsJson = readFileSync(imageIdsPath, 'utf-8');
    const imageIds = JSON.parse(imageIdsJson);
    return imageIds;
  } catch {
    // Fallback: These are placeholders - replace with actual image IDs
    console.warn('Warning: Using placeholder image IDs. Run compute_image_ids test to get real values.');
    return {
      income_threshold: Array.from({ length: 32 }, (_, i) => i % 256),
      income_range: Array.from({ length: 32 }, (_, i) => (i + 1) % 256),
      credit_score: Array.from({ length: 32 }, (_, i) => (i + 2) % 256),
      payment: Array.from({ length: 32 }, (_, i) => (i + 3) % 256),
      balance: Array.from({ length: 32 }, (_, i) => (i + 4) % 256),
    };
  }
}

// Shared test state (module-level, like payroll.test.ts)
let worker: Worker;
let root: NearAccount;
let owner: NearAccount;
let payroll: NearAccount;
let zkVerifier: NearAccount;
let wzecToken: NearAccount;
let employee1: NearAccount;
let bank: NearAccount;

// Check if proof-server is available
async function isProofServerAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${PROOF_SERVER_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

// Check if proof-server is in DEV_MODE
async function isDevMode(): Promise<boolean> {
  try {
    const response = await fetch(`${PROOF_SERVER_URL}/status`);
    const status = await response.json();
    return status.dev_mode === true;
  } catch {
    return false;
  }
}

// Proof request types matching proof-server API
interface IncomeThresholdParams {
  payment_history: number[];
  threshold: number;
  history_commitment: number[];
  employee_id?: string;
}

interface IncomeRangeParams {
  payment_history: number[];
  min: number;
  max: number;
  history_commitment: number[];
  employee_id?: string;
}

interface CreditScoreParams {
  payment_history: number[];
  expected_salary: number;
  threshold: number;
  history_commitment: number[];
  employee_id?: string;
}

type ProofParams = IncomeThresholdParams | IncomeRangeParams | CreditScoreParams;

// Generate proof via proof-server
async function generateProof(
  proofType: 'income_threshold' | 'income_range' | 'credit_score',
  params: ProofParams
): Promise<any> {
  const response = await fetch(`${PROOF_SERVER_URL}/api/v1/proof/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      proof_type: proofType,
      params,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Proof generation failed: ${error}`);
  }

  return response.json();
}

// Compute history commitment (must match contract)
function computeHistoryCommitment(commitments: number[][]): number[] {
  const hasher = createHash('sha256');
  hasher.update(Buffer.from('near-private-payroll:history:v1:'));
  for (const commitment of commitments) {
    hasher.update(Buffer.from(commitment));
  }
  return Array.from(hasher.digest());
}

test.before(async () => {
  // Auto-start proof-server if not running
  await ensureProofServerRunning();
  const devMode = await isDevMode();

  console.log('\n========================================');
  console.log(`  Proof Server: ${devMode ? 'DEV_MODE (mock proofs)' : 'PRODUCTION (real Groth16)'}`);
  console.log('========================================\n');

  worker = await Worker.init();
  root = worker.rootAccount;

  // Create accounts
  owner = await root.createSubAccount('owner', {
    initialBalance: parseNEARAmount('100'),
  });

  // Deploy contracts
  payroll = await root.createSubAccount('payroll', {
    initialBalance: parseNEARAmount('50'),
  });
  zkVerifier = await root.createSubAccount('zkverifier', {
    initialBalance: parseNEARAmount('50'),
  });
  wzecToken = await root.createSubAccount('wzec', {
    initialBalance: parseNEARAmount('50'),
  });

  // Deploy WASM files (paths must match payroll.test.ts)
  const contractsPath = path.join(__dirname, '..', 'target', 'near');

  await zkVerifier.deploy(path.join(contractsPath, 'zk_verifier', 'zk_verifier.wasm'));
  await zkVerifier.call(zkVerifier, 'new', { owner: owner.accountId });

  await wzecToken.deploy(path.join(contractsPath, 'wzec_token', 'wzec_token.wasm'));
  await wzecToken.call(wzecToken, 'new', {
    owner: owner.accountId,
    total_supply: '1000000000000',
    bridge_controller: owner.accountId,
  });

  await payroll.deploy(path.join(contractsPath, 'payroll_contract', 'payroll_contract.wasm'));
  await payroll.call(payroll, 'new', {
    owner: owner.accountId,
    wzec_token: wzecToken.accountId,
    zk_verifier: zkVerifier.accountId,
  });

  // Create test accounts
  employee1 = await root.createSubAccount('emp1', {
    initialBalance: parseNEARAmount('10'),
  });
  bank = await root.createSubAccount('bank', {
    initialBalance: parseNEARAmount('10'),
  });

  console.log('\n========================================');
  console.log('  Integration Test Suite');
  console.log('========================================');
  console.log(`  Proof Server: ${PROOF_SERVER_URL}`);
  console.log(`  Payroll: ${payroll.accountId}`);
  console.log(`  ZK Verifier: ${zkVerifier.accountId}`);
  console.log(`  Employee: ${employee1.accountId}`);
  console.log(`  Bank: ${bank.accountId}`);
  console.log('========================================\n');
});

test.after.always(async () => {
  await worker?.tearDown();
});

// ==================== SETUP ====================

test.serial('setup: register REAL verification key and image IDs', async (t) => {
  console.log('  Loading real RISC Zero verification key...');

  // Load real verification key from risc0_vk.json
  const verificationKey = loadVerificationKey();
  console.log('  ✓ Loaded VK from scripts/risc0_vk.json');

  // Register VK for all proof types (universal VK)
  const proofTypes = ['IncomeThreshold', 'IncomeRange', 'CreditScore', 'PaymentProof', 'BalanceProof'];

  for (const proofType of proofTypes) {
    await owner.call(
      zkVerifier,
      'register_verification_key',
      {
        proof_type: proofType,
        vk: verificationKey,
      },
      { gas: 300000000000000n }
    );
    console.log(`  ✓ Registered VK for ${proofType}`);
  }

  // Load and register image IDs
  console.log('\n  Loading circuit image IDs...');
  const imageIds = getImageIds();

  // Register image IDs
  const imageIdMappings = [
    { proof_type: 'IncomeThreshold', image_id: imageIds.income_threshold },
    { proof_type: 'IncomeRange', image_id: imageIds.income_range },
    { proof_type: 'CreditScore', image_id: imageIds.credit_score },
    { proof_type: 'PaymentProof', image_id: imageIds.payment },
    { proof_type: 'BalanceProof', image_id: imageIds.balance },
  ];

  for (const { proof_type, image_id } of imageIdMappings) {
    await owner.call(
      zkVerifier,
      'register_image_id',
      {
        proof_type,
        image_id,
      },
      { gas: 300000000000000n }
    );
    console.log(`  ✓ Registered image ID for ${proof_type}`);
  }

  console.log('\n  ✓ All verification keys and image IDs registered');
  t.pass('Real VK and image IDs registered');
});

test.serial('setup: add employee with payments', async (t) => {
  // Add employee
  await owner.call(payroll, 'add_employee', {
    employee_id: employee1.accountId,
    encrypted_name: Array.from(Buffer.from('Test Employee')),
    encrypted_salary: Array.from(Buffer.from('enc_5000')),
    salary_commitment: new Array(32).fill(0).map((_, i) => i),
    public_key: new Array(32).fill(1),
  });

  // Add payments (needed for history commitment)
  const payments = [
    { amount: 5000, period: '2024-01' },
    { amount: 5200, period: '2024-02' },
    { amount: 5100, period: '2024-03' },
  ];

  for (const payment of payments) {
    const commitment = new Array(32).fill(0).map((_, i) => (payment.amount + i) % 256);
    await owner.call(payroll, 'pay_employee', {
      employee_id: employee1.accountId,
      encrypted_amount: Array.from(Buffer.from(`enc_${payment.amount}`)),
      payment_commitment: commitment,
      period: payment.period,
      zk_proof: new Array(256).fill(0),
    });
  }

  const paymentCount: number = await payroll.view('get_payment_count', {
    employee_id: employee1.accountId,
  }) as number;

  t.is(paymentCount, 3, 'Employee should have 3 payments');
});

// ==================== PROOF SERVER TESTS ====================

test.serial('proof-server: health check', async (t) => {
  const available = await isProofServerAvailable();

  if (!available) {
    t.log('Skipping: proof-server not running');
    t.pass('Skipped - start proof-server with: cargo run -p proof-server');
    return;
  }

  const response = await fetch(`${PROOF_SERVER_URL}/health`);
  t.true(response.ok, 'Health endpoint should return 200');

  const health = await response.json();
  t.is(health.status, 'ok', 'Status should be ok');
});

test.serial('proof-server: generate income threshold proof', async (t) => {
  const available = await isProofServerAvailable();

  if (!available) {
    t.log('Skipping: proof-server not running');
    t.pass('Skipped');
    return;
  }

  // Build history commitment
  const paymentCommitments = [
    new Array(32).fill(0).map((_, i) => (5000 + i) % 256),
    new Array(32).fill(0).map((_, i) => (5200 + i) % 256),
    new Array(32).fill(0).map((_, i) => (5100 + i) % 256),
  ];
  const historyCommitment = computeHistoryCommitment(paymentCommitments);

  try {
    const result = await generateProof('income_threshold', {
      payment_history: [5000, 5200, 5100],
      threshold: 5000,
      history_commitment: historyCommitment,
      employee_id: employee1.accountId,
    });

    t.truthy(result.proof, 'Should have proof bytes');
    t.truthy(result.image_id, 'Should have image_id');
    t.truthy(result.public_inputs, 'Should have public_inputs');

    console.log('  Proof generated:');
    console.log(`    - Proof size: ${result.proof.length} bytes`);
    console.log(`    - Image ID: ${Buffer.from(result.image_id).toString('hex').slice(0, 16)}...`);
    console.log(`    - Generation time: ${result.generation_time_ms}ms`);

    // API returns flat public_inputs structure
    const inputs = result.public_inputs;
    console.log(`    - Threshold: ${inputs.threshold}`);
    console.log(`    - Meets threshold: ${inputs.meets_threshold}`);
    console.log(`    - Payment count: ${inputs.payment_count}`);

    // Verify the values
    t.is(inputs.threshold, 5000, 'Threshold should match request');
    t.true(inputs.meets_threshold, 'Should meet threshold (5100 >= 5000)');
    t.is(inputs.payment_count, 3, 'Should have 3 payments');

    t.pass('Proof generated successfully');
  } catch (error) {
    t.fail(`Proof generation failed: ${error}`);
  }
});

test.serial('integration: full income proof flow with REAL verification', async (t) => {
  const available = await isProofServerAvailable();

  if (!available) {
    t.log('Skipping: proof-server not running');
    t.pass('Skipped');
    return;
  }

  const devMode = await isDevMode();

  // Step 1: Get payment commitments from contract
  const paymentCount: number = await payroll.view('get_payment_count', {
    employee_id: employee1.accountId,
  }) as number;
  console.log(`  Employee has ${paymentCount} payments`);

  // Build history commitment (must match what contract expects)
  const paymentCommitments = [
    new Array(32).fill(0).map((_, i) => (5000 + i) % 256),
    new Array(32).fill(0).map((_, i) => (5200 + i) % 256),
    new Array(32).fill(0).map((_, i) => (5100 + i) % 256),
  ];
  const historyCommitment = computeHistoryCommitment(paymentCommitments);

  // Step 2: Generate proof via proof-server
  console.log('  Generating proof via proof-server...');
  console.log(`  Mode: ${devMode ? 'DEV_MODE (mock proofs)' : 'PRODUCTION (real Groth16)'}`);

  let proofResult;
  try {
    proofResult = await generateProof('income_threshold', {
      payment_history: [5000, 5200, 5100],
      threshold: 5000,
      history_commitment: historyCommitment,
      employee_id: employee1.accountId,
    });
    console.log(`  ✓ Proof generated (${proofResult.proof.length} bytes, ${proofResult.generation_time_ms}ms)`);
  } catch (error) {
    t.fail(`Failed to generate proof: ${error}`);
    return;
  }

  // Step 3: Submit proof to payroll contract
  console.log('  Submitting proof to contract...');

  const receipt = proofResult.proof;

  let proofVerified = false;
  try {
    await employee1.call(
      payroll,
      'submit_income_proof',
      {
        proof_type: 'AboveThreshold',
        threshold: 5000,
        range_min: null,
        range_max: null,
        risc_zero_receipt: receipt,
        history_commitment: historyCommitment,
        expires_in_days: 30,
      },
      { gas: 300000000000000n }
    );
    console.log('  ✓ Proof submitted and verified successfully');
    proofVerified = true;
  } catch (error: any) {
    if (devMode) {
      console.log('  ⚠ Proof verification failed (expected with DEV_MODE)');
      console.log(`    Error: ${error.message}`);
    } else {
      console.log('  ✗ Proof verification FAILED (unexpected with real Groth16)');
      t.fail(`Proof verification should succeed with real Groth16: ${error.message}`);
      return;
    }
  }

  // Step 4: Check if proof was stored (only if verification passed)
  if (proofVerified) {
    const storedProof = await payroll.view('get_employee_income_proof', {
      employee_id: employee1.accountId,
      proof_type: 'AboveThreshold',
    });

    t.truthy(storedProof, 'Proof should be stored after successful verification');
    console.log('  ✓ Verified proof stored on-chain');
  }

  // Step 5: Test disclosure flow
  console.log('  Testing disclosure flow...');

  await employee1.call(payroll, 'grant_disclosure', {
    verifier: bank.accountId,
    disclosure_type: { IncomeAboveThreshold: { threshold: '5000' } },
    duration_days: 30,
  });
  console.log('  ✓ Disclosure granted to bank');

  const meetsRequirement: boolean = await bank.call(
    payroll,
    'verify_income_requirement',
    {
      employee_id: employee1.accountId,
      required_type: 'AboveThreshold',
      required_threshold: 5000,
    }
  ) as boolean;

  console.log(`  Bank verification result: ${meetsRequirement}`);

  if (devMode) {
    // With DEV_MODE, verification fails so proof isn't stored
    t.false(meetsRequirement, 'Expected false with DEV_MODE (proof not verified)');
  } else {
    // With real Groth16, verification should pass
    t.true(meetsRequirement, 'Expected true with real Groth16 proofs');
  }

  console.log('\n  ==========================================');
  console.log('  INTEGRATION TEST SUMMARY:');
  console.log(`  1. Proof-server mode: ${devMode ? 'DEV_MODE' : 'PRODUCTION'}`);
  console.log('  2. Proof generated successfully');
  console.log('  3. Contract received and processed proof');
  if (devMode) {
    console.log('  4. Groth16 verification FAILED (expected with DEV_MODE)');
    console.log('  5. Disclosure flow works correctly');
    console.log('  ');
    console.log('  To test REAL verification:');
    console.log('  - Restart proof-server WITHOUT DEV_MODE=true');
    console.log('  - Real Groth16 proofs take ~2 minutes to generate');
  } else {
    console.log('  4. Groth16 verification PASSED ✓');
    console.log('  5. Proof stored on-chain ✓');
    console.log('  6. Bank verification successful ✓');
  }
  console.log('  ==========================================\n');

  t.pass('Integration flow completed');
});

// ==================== ADDITIONAL PROOF TYPE TESTS ====================

test.serial('proof-server: generate income range proof', async (t) => {
  const available = await isProofServerAvailable();

  if (!available) {
    t.log('Skipping: proof-server not running');
    t.pass('Skipped');
    return;
  }

  const paymentCommitments = [
    new Array(32).fill(0).map((_, i) => (4000 + i) % 256),
    new Array(32).fill(0).map((_, i) => (5000 + i) % 256),
    new Array(32).fill(0).map((_, i) => (6000 + i) % 256),
  ];
  const historyCommitment = computeHistoryCommitment(paymentCommitments);

  try {
    const result = await generateProof('income_range', {
      payment_history: [4000, 5000, 6000],
      min: 3000,
      max: 7000,
      history_commitment: historyCommitment,
      employee_id: employee1.accountId,
    });

    t.truthy(result.proof, 'Should have proof bytes');
    t.truthy(result.public_inputs, 'Should have public_inputs');

    const inputs = result.public_inputs;
    console.log('  Income Range Proof:');
    console.log(`    - Min: ${inputs.min}, Max: ${inputs.max}`);
    console.log(`    - In range: ${inputs.in_range}`);
    console.log(`    - Payment count: ${inputs.payment_count}`);

    // Verify values - last payment is 6000, which is in range [3000, 7000]
    t.is(inputs.min, 3000, 'Min should match request');
    t.is(inputs.max, 7000, 'Max should match request');
    t.true(inputs.in_range, 'Should be in range (6000 is between 3000 and 7000)');
    t.is(inputs.payment_count, 3, 'Should have 3 payments');

    t.pass('Income range proof generated successfully');
  } catch (error) {
    t.fail(`Proof generation failed: ${error}`);
  }
});

test.serial('proof-server: generate credit score proof', async (t) => {
  const available = await isProofServerAvailable();

  if (!available) {
    t.log('Skipping: proof-server not running');
    t.pass('Skipped');
    return;
  }

  // Consistent payments (within 10% tolerance) earn +50 per payment
  // 6 consistent payments: 300 (base) + 6*50 = 600 score
  const paymentCommitments = [
    new Array(32).fill(0).map((_, i) => (5000 + i) % 256),
    new Array(32).fill(0).map((_, i) => (5100 + i) % 256),
    new Array(32).fill(0).map((_, i) => (5050 + i) % 256),
    new Array(32).fill(0).map((_, i) => (4950 + i) % 256),
    new Array(32).fill(0).map((_, i) => (5200 + i) % 256),
    new Array(32).fill(0).map((_, i) => (4900 + i) % 256),
  ];
  const historyCommitment = computeHistoryCommitment(paymentCommitments);

  try {
    const result = await generateProof('credit_score', {
      payment_history: [5000, 5100, 5050, 4950, 5200, 4900],
      expected_salary: 5000,
      threshold: 500, // Score should be 600, above 500 threshold
      history_commitment: historyCommitment,
      employee_id: employee1.accountId,
    });

    t.truthy(result.proof, 'Should have proof bytes');
    t.truthy(result.public_inputs, 'Should have public_inputs');

    const inputs = result.public_inputs;
    console.log('  Credit Score Proof:');
    console.log(`    - Threshold: ${inputs.threshold}`);
    console.log(`    - Meets threshold: ${inputs.meets_threshold}`);
    console.log(`    - Payment count: ${inputs.payment_count}`);

    // Verify values
    t.is(inputs.threshold, 500, 'Threshold should match request');
    t.true(inputs.meets_threshold, 'Should meet threshold (score ~600 >= 500)');
    t.is(inputs.payment_count, 6, 'Should have 6 payments');

    t.pass('Credit score proof generated successfully');
  } catch (error) {
    t.fail(`Proof generation failed: ${error}`);
  }
});

test.serial('proof-server: income threshold proof with failing condition', async (t) => {
  const available = await isProofServerAvailable();

  if (!available) {
    t.log('Skipping: proof-server not running');
    t.pass('Skipped');
    return;
  }

  const paymentCommitments = [
    new Array(32).fill(0).map((_, i) => (3000 + i) % 256),
  ];
  const historyCommitment = computeHistoryCommitment(paymentCommitments);

  try {
    // Request threshold higher than actual income
    const result = await generateProof('income_threshold', {
      payment_history: [3000],
      threshold: 5000, // 3000 < 5000, so should fail
      history_commitment: historyCommitment,
      employee_id: employee1.accountId,
    });

    const inputs = result.public_inputs;
    console.log('  Income Threshold (failing case):');
    console.log(`    - Threshold: ${inputs.threshold}`);
    console.log(`    - Meets threshold: ${inputs.meets_threshold}`);

    // Proof generates but meets_threshold should be false
    t.is(inputs.threshold, 5000, 'Threshold should match request');
    t.false(inputs.meets_threshold, 'Should NOT meet threshold (3000 < 5000)');
    t.is(inputs.payment_count, 1, 'Should have 1 payment');

    t.pass('Failing threshold proof generated correctly');
  } catch (error) {
    t.fail(`Proof generation failed: ${error}`);
  }
});
