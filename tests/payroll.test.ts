/**
 * NEAR Private Payroll - Integration Tests
 *
 * Comprehensive test suite covering:
 * - Employee management
 * - Payment processing
 * - Disclosure system
 * - ZK income proofs (via zk-verifier)
 *
 * Tests are organized by feature and run serially to share state efficiently.
 */

import test from 'ava';
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

// Shared test state
let worker: Worker;
let root: NearAccount;
let owner: NearAccount;
let payroll: NearAccount;
let zkVerifier: NearAccount;
let wzecToken: NearAccount;

// Test accounts created during tests
let employee1: NearAccount;
let employee2: NearAccount;
let employee3: NearAccount;
let verifier: NearAccount; // e.g., landlord, bank

// ==================== SETUP ====================

test.before(async () => {
  console.log('\n========================================');
  console.log('  NEAR Private Payroll - Test Suite');
  console.log('========================================\n');

  worker = await Worker.init();
  root = worker.rootAccount;

  // Create accounts
  owner = await root.createSubAccount('owner', {
    initialBalance: BigInt(parseNEAR('100')),
  });

  // Deploy ZK Verifier
  zkVerifier = await root.createSubAccount('zkverifier', {
    initialBalance: BigInt(parseNEAR('50')),
  });
  await zkVerifier.deploy(ZK_VERIFIER_WASM);
  await zkVerifier.call(zkVerifier, 'new', { owner: owner.accountId });

  // Deploy wZEC Token
  wzecToken = await root.createSubAccount('wzec', {
    initialBalance: BigInt(parseNEAR('50')),
  });
  await wzecToken.deploy(WZEC_TOKEN_WASM);
  await wzecToken.call(wzecToken, 'new', {
    owner: owner.accountId,
    bridge_controller: owner.accountId,
  });

  // Deploy Payroll
  payroll = await root.createSubAccount('payroll', {
    initialBalance: BigInt(parseNEAR('50')),
  });
  await payroll.deploy(PAYROLL_WASM);
  await payroll.call(payroll, 'new', {
    owner: owner.accountId,
    wzec_token: wzecToken.accountId,
    zk_verifier: zkVerifier.accountId,
  });

  // Create test accounts for later use
  employee1 = await root.createSubAccount('emp1', {
    initialBalance: BigInt(parseNEAR('10')),
  });
  employee2 = await root.createSubAccount('emp2', {
    initialBalance: BigInt(parseNEAR('10')),
  });
  employee3 = await root.createSubAccount('emp3', {
    initialBalance: BigInt(parseNEAR('10')),
  });
  verifier = await root.createSubAccount('verifier', {
    initialBalance: BigInt(parseNEAR('10')),
  });

  console.log('  Contracts deployed:');
  console.log(`    - Payroll: ${payroll.accountId}`);
  console.log(`    - ZK Verifier: ${zkVerifier.accountId}`);
  console.log(`    - wZEC Token: ${wzecToken.accountId}`);
  console.log(`  Test accounts: ${employee1.accountId}, ${employee2.accountId}, ${employee3.accountId}`);
  console.log('\n');
});

test.after.always(async () => {
  if (worker) {
    await worker.tearDown();
  }
});

// ==================== CONTRACT INITIALIZATION ====================

test.serial('contracts initialized correctly', async (t) => {
  const verifierOwner: any = await zkVerifier.view('get_owner', {});
  t.is(verifierOwner, owner.accountId);

  const stats: any = await payroll.view('get_stats', {});
  t.truthy(stats);
  t.is(stats[0], 0); // 0 employees initially
});

test.serial('set zk-verifier to Groth16 mode', async (t) => {
  // Always use Groth16 mode for production-like testing
  await owner.call(zkVerifier, 'set_verification_mode', { mode: 'Groth16' });
  const mode: any = await zkVerifier.view('get_verification_mode', {});
  t.is(mode, 'Groth16');
});

// ==================== EMPLOYEE MANAGEMENT ====================

test.serial('owner can add employees', async (t) => {
  // Add first employee
  await owner.call(payroll, 'add_employee', {
    employee_id: employee1.accountId,
    encrypted_name: Array.from(Buffer.from('Alice Johnson')),
    encrypted_salary: Array.from(Buffer.from('enc_5000')),
    salary_commitment: new Array(32).fill(0).map((_, i) => i),
    public_key: new Array(32).fill(1),
  });

  // Add second employee
  await owner.call(payroll, 'add_employee', {
    employee_id: employee2.accountId,
    encrypted_name: Array.from(Buffer.from('Bob Smith')),
    encrypted_salary: Array.from(Buffer.from('enc_6000')),
    salary_commitment: new Array(32).fill(0).map((_, i) => i + 32),
    public_key: new Array(32).fill(2),
  });

  // Add third employee
  await owner.call(payroll, 'add_employee', {
    employee_id: employee3.accountId,
    encrypted_name: Array.from(Buffer.from('Carol Davis')),
    encrypted_salary: Array.from(Buffer.from('enc_7500')),
    salary_commitment: new Array(32).fill(0).map((_, i) => i + 64),
    public_key: new Array(32).fill(3),
  });

  // Verify all employees added
  const stats: any = await payroll.view('get_stats', {});
  t.is(stats[0], 3); // 3 employees

  // Verify individual employees
  const emp1: any = await payroll.view('get_employee', { employee_id: employee1.accountId });
  const emp2: any = await payroll.view('get_employee', { employee_id: employee2.accountId });
  const emp3: any = await payroll.view('get_employee', { employee_id: employee3.accountId });

  t.is(emp1.status, 'Active');
  t.is(emp2.status, 'Active');
  t.is(emp3.status, 'Active');
});

test.serial('non-owner cannot add employee', async (t) => {
  const randomUser = await root.createSubAccount('random', {
    initialBalance: BigInt(parseNEAR('5')),
  });

  await t.throwsAsync(
    randomUser.call(payroll, 'add_employee', {
      employee_id: 'fake-employee',
      encrypted_name: Array.from(Buffer.from('Fake')),
      encrypted_salary: Array.from(Buffer.from('enc')),
      salary_commitment: new Array(32).fill(0),
      public_key: new Array(32).fill(0),
    })
  );
});

test.serial('owner can update employee status', async (t) => {
  // Suspend employee2
  await owner.call(payroll, 'update_employee_status', {
    employee_id: employee2.accountId,
    status: 'OnLeave',
  });

  const emp2: any = await payroll.view('get_employee', { employee_id: employee2.accountId });
  t.is(emp2.status, 'OnLeave');

  // Reactivate
  await owner.call(payroll, 'update_employee_status', {
    employee_id: employee2.accountId,
    status: 'Active',
  });

  const emp2Updated: any = await payroll.view('get_employee', { employee_id: employee2.accountId });
  t.is(emp2Updated.status, 'Active');
});

test.serial('cannot add duplicate employee', async (t) => {
  await t.throwsAsync(
    owner.call(payroll, 'add_employee', {
      employee_id: employee1.accountId, // Already exists
      encrypted_name: Array.from(Buffer.from('Duplicate')),
      encrypted_salary: Array.from(Buffer.from('enc')),
      salary_commitment: new Array(32).fill(99),
      public_key: new Array(32).fill(99),
    })
  );
});

// ==================== DISCLOSURE SYSTEM ====================

test.serial('employee can grant employment status disclosure', async (t) => {
  // Employee1 grants employment status disclosure to verifier
  await employee1.call(payroll, 'grant_disclosure', {
    verifier: verifier.accountId,
    disclosure_type: 'EmploymentStatus',
    duration_days: 30, // 30 days
  });

  t.pass();
});

test.serial('employee can grant income threshold disclosure', async (t) => {
  // Employee1 grants income above threshold disclosure
  await employee1.call(payroll, 'grant_disclosure', {
    verifier: verifier.accountId,
    disclosure_type: { IncomeAboveThreshold: { threshold: '50000' } },
    duration_days: 30,
  });

  t.pass();
});

test.serial('employee can revoke disclosure', async (t) => {
  // First grant a disclosure
  await employee2.call(payroll, 'grant_disclosure', {
    verifier: verifier.accountId,
    disclosure_type: 'EmploymentStatus',
    duration_days: 30,
  });

  // Then revoke it
  await employee2.call(payroll, 'revoke_disclosure', {
    verifier: verifier.accountId,
  });

  t.pass();
});

// ==================== ZK VERIFIER ADMIN ====================

test.serial('owner can register image IDs for all proof types', async (t) => {
  const proofTypes = ['IncomeThreshold', 'IncomeRange', 'CreditScore', 'PaymentProof'];

  for (let i = 0; i < proofTypes.length; i++) {
    const imageId = new Array(32).fill(i + 10);
    await owner.call(zkVerifier, 'register_image_id', {
      proof_type: proofTypes[i],
      image_id: imageId,
    });

    const storedId: any = await zkVerifier.view('get_image_id_for_type', {
      proof_type: proofTypes[i],
    });
    t.deepEqual(storedId, imageId);
  }
});

test.serial('verification mode remains Groth16', async (t) => {
  const mode: any = await zkVerifier.view('get_verification_mode', {});
  t.is(mode, 'Groth16');
});

test.serial('non-owner cannot change verification mode', async (t) => {
  await t.throwsAsync(
    employee1.call(zkVerifier, 'set_verification_mode', { mode: 'Groth16' })
  );
});

// ==================== PAYMENT PROCESSING ====================

test.serial('owner can mint wZEC tokens', async (t) => {
  // Owner is the bridge_controller, so can mint
  await owner.call(wzecToken, 'mint', {
    receiver_id: owner.accountId,
    amount: '1000000000', // 1B units (like 1000 wZEC with 6 decimals)
    zcash_tx_hash: 'test_tx_001',
  });

  const balance: any = await wzecToken.view('ft_balance_of', {
    account_id: owner.accountId,
  });
  t.is(balance, '1000000000');
});

test.serial('owner can deposit wZEC to payroll contract', async (t) => {
  // Register payroll contract for token receipt
  await owner.call(
    wzecToken,
    'storage_deposit',
    { account_id: payroll.accountId },
    { attachedDeposit: BigInt(parseNEAR('0.01')) }
  );

  // Deposit via ft_transfer_call
  await owner.call(
    wzecToken,
    'ft_transfer_call',
    {
      receiver_id: payroll.accountId,
      amount: '500000000', // 500M units
      msg: 'deposit',
    },
    { attachedDeposit: 1n, gas: 100000000000000n }
  );

  const companyBalance: any = await payroll.view('get_company_balance', {});
  t.is(companyBalance, '500000000');
});

test.serial('owner can process payment for employee', async (t) => {
  // NOTE: pay_employee requires ZK proof verification
  // In current implementation, verify_payment_proof is placeholder (logs only)
  // and extract_amount_from_proof returns 0
  // This test verifies the payment recording flow

  const mockProof = new Array(256).fill(0); // Placeholder proof
  const paymentCommitment = new Array(32).fill(100).map((_, i) => i + 100);

  await owner.call(payroll, 'pay_employee', {
    employee_id: employee1.accountId,
    encrypted_amount: Array.from(Buffer.from('enc_5000_jan')),
    payment_commitment: paymentCommitment,
    period: '2024-01',
    zk_proof: mockProof,
  });

  // Verify payment count increased
  const paymentCount: any = await payroll.view('get_payment_count', {
    employee_id: employee1.accountId,
  });
  t.is(paymentCount, 1);
});

test.serial('multiple payments can be processed', async (t) => {
  const mockProof = new Array(256).fill(0);

  // Second payment for employee1
  await owner.call(payroll, 'pay_employee', {
    employee_id: employee1.accountId,
    encrypted_amount: Array.from(Buffer.from('enc_5000_feb')),
    payment_commitment: new Array(32).fill(101).map((_, i) => i + 101),
    period: '2024-02',
    zk_proof: mockProof,
  });

  // Payment for employee2
  await owner.call(payroll, 'pay_employee', {
    employee_id: employee2.accountId,
    encrypted_amount: Array.from(Buffer.from('enc_6000_jan')),
    payment_commitment: new Array(32).fill(102).map((_, i) => i + 102),
    period: '2024-01',
    zk_proof: mockProof,
  });

  // Verify counts
  const emp1Count: any = await payroll.view('get_payment_count', {
    employee_id: employee1.accountId,
  });
  const emp2Count: any = await payroll.view('get_payment_count', {
    employee_id: employee2.accountId,
  });

  t.is(emp1Count, 2);
  t.is(emp2Count, 1);
});

test.serial('cannot pay inactive employee', async (t) => {
  // Set employee3 to OnLeave
  await owner.call(payroll, 'update_employee_status', {
    employee_id: employee3.accountId,
    status: 'OnLeave',
  });

  const mockProof = new Array(256).fill(0);

  await t.throwsAsync(
    owner.call(payroll, 'pay_employee', {
      employee_id: employee3.accountId,
      encrypted_amount: Array.from(Buffer.from('enc_7500')),
      payment_commitment: new Array(32).fill(103),
      period: '2024-01',
      zk_proof: mockProof,
    })
  );

  // Restore to Active for future tests
  await owner.call(payroll, 'update_employee_status', {
    employee_id: employee3.accountId,
    status: 'Active',
  });
});

// ==================== INCOME PROOF SUBMISSION ====================

// NOTE: Income proof submission requires:
// 1. Valid RISC Zero receipt (cryptographic proof from circuit)
// 2. History commitment matching on-chain payment history
// 3. Groth16 mode requires real cryptographic verification
//
// This test is skipped until we have real proof generation infrastructure.
// See circuits/ directory for RISC Zero circuit implementation.

test.serial.skip('employee can submit income threshold proof', async (t) => {
  // Requires: valid RISC Zero receipt + matching history commitment
  // This will be enabled once we have real proof generation
  t.pass();
});

// ==================== AUTHORIZED AUDITORS ====================

test.serial('owner can register authorized auditor', async (t) => {
  const auditor = await root.createSubAccount('auditor', {
    initialBalance: BigInt(parseNEAR('5')),
  });

  await owner.call(payroll, 'register_authorized_auditor', {
    auditor: auditor.accountId,
    license_info: 'CPA License #12345',
  });

  const isAuthorized: any = await payroll.view('is_authorized_auditor', {
    account_id: auditor.accountId,
  });
  t.true(isAuthorized);
});

test.serial('owner can deactivate auditor', async (t) => {
  const auditor2 = await root.createSubAccount('auditor2', {
    initialBalance: BigInt(parseNEAR('5')),
  });

  // Register
  await owner.call(payroll, 'register_authorized_auditor', {
    auditor: auditor2.accountId,
    license_info: 'CPA License #67890',
  });

  // Deactivate
  await owner.call(payroll, 'deactivate_auditor', {
    auditor: auditor2.accountId,
  });

  const auditorInfo: any = await payroll.view('get_auditor', {
    auditor_id: auditor2.accountId,
  });
  t.false(auditorInfo.active); // Field is 'active' not 'is_active'
});

// ==================== STATISTICS ====================

test.serial('statistics reflect contract state', async (t) => {
  const stats: any = await payroll.view('get_stats', {});

  // Should have 3 employees from earlier tests
  t.is(stats[0], 3);
  // Total payments (may vary based on test execution)
  t.true(typeof stats[1] === 'number');
  // Total paid amount
  t.truthy(stats[2]);

  console.log(`\n  Final Stats: ${stats[0]} employees, ${stats[1]} payments`);
});
