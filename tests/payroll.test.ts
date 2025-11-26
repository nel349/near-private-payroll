/**
 * NEAR Private Payroll - Integration Tests
 *
 * Minimal test suite to verify test infrastructure works.
 * Tests adapted from zkSalaria for the trustless NEAR architecture.
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

let worker: Worker;
let root: NearAccount;
let owner: NearAccount;
let payroll: NearAccount;
let zkVerifier: NearAccount;
let wzecToken: NearAccount;

// ==================== SETUP ====================

test.before(async (t) => {
  console.log('\n🚀 Initializing test environment...\n');

  worker = await Worker.init();
  root = worker.rootAccount;

  // Create owner account
  owner = await root.createSubAccount('owner', {
    initialBalance: BigInt(parseNEAR('100')),
  });
  console.log(`  ✓ Owner account: ${owner.accountId}`);

  // Deploy ZK Verifier
  zkVerifier = await root.createSubAccount('zkverifier', {
    initialBalance: BigInt(parseNEAR('50')),
  });
  await zkVerifier.deploy(ZK_VERIFIER_WASM);
  await zkVerifier.call(zkVerifier, 'new', { owner: owner.accountId });
  console.log(`  ✓ ZK Verifier deployed: ${zkVerifier.accountId}`);

  // Deploy wZEC Token
  wzecToken = await root.createSubAccount('wzec', {
    initialBalance: BigInt(parseNEAR('50')),
  });
  await wzecToken.deploy(WZEC_TOKEN_WASM);
  await wzecToken.call(wzecToken, 'new', {
    owner: owner.accountId,
    bridge_controller: owner.accountId, // For testing, owner is also bridge controller
  });
  console.log(`  ✓ wZEC Token deployed: ${wzecToken.accountId}`);

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
  console.log(`  ✓ Payroll deployed: ${payroll.accountId}`);

  console.log('\n✅ Test environment ready!\n');
});

test.after.always(async () => {
  if (worker) {
    await worker.tearDown();
    console.log('\n🧹 Test environment cleaned up\n');
  }
});

// ==================== BASIC SANITY TESTS ====================

test.serial('contracts are deployed and initialized', async (t) => {
  // Check zk-verifier owner (payroll doesn't expose owner getter)
  const verifierOwner: any = await zkVerifier.view('get_owner', {});
  t.is(verifierOwner, owner.accountId);

  // Check payroll has stats function working (confirms deployment)
  const stats: any = await payroll.view('get_stats', {});
  t.truthy(stats);

  console.log('✅ All contracts initialized correctly');
});

test.serial('zk-verifier starts in DevMode', async (t) => {
  const mode: any = await zkVerifier.view('get_verification_mode', {});
  t.is(mode, 'DevMode');
  console.log('✅ ZK Verifier is in DevMode');
});

// ==================== EMPLOYEE MANAGEMENT ====================

test.serial('owner can add employee', async (t) => {
  const employee1 = await root.createSubAccount('employee1', {
    initialBalance: BigInt(parseNEAR('10')),
  });

  // Create a mock salary commitment (32 bytes)
  const salaryCommitment = new Array(32).fill(0).map((_, i) => i);

  await owner.call(payroll, 'add_employee', {
    employee_id: employee1.accountId,
    encrypted_name: Array.from(Buffer.from('Alice Test')),
    encrypted_salary: Array.from(Buffer.from('encrypted_5000')),
    salary_commitment: salaryCommitment,
    public_key: new Array(32).fill(1),
  });

  const employee: any = await payroll.view('get_employee', {
    employee_id: employee1.accountId,
  });

  t.truthy(employee);
  t.is(employee.status, 'Active');
  console.log('✅ Employee added successfully');
});

test.serial('non-owner cannot add employee', async (t) => {
  const randomUser = await root.createSubAccount('randomuser', {
    initialBalance: BigInt(parseNEAR('5')),
  });

  const error = await t.throwsAsync(
    randomUser.call(payroll, 'add_employee', {
      employee_id: 'fake-employee',
      encrypted_name: Array.from(Buffer.from('Fake')),
      encrypted_salary: Array.from(Buffer.from('encrypted')),
      salary_commitment: new Array(32).fill(0),
      public_key: new Array(32).fill(0),
    })
  );

  t.truthy(error);
  console.log('✅ Non-owner correctly rejected');
});

// ==================== ZK VERIFIER ADMIN ====================

test.serial('owner can register image ID', async (t) => {
  const mockImageId = new Array(32).fill(42);

  await owner.call(zkVerifier, 'register_image_id', {
    proof_type: 'IncomeThreshold',
    image_id: mockImageId,
  });

  // Use get_image_id_for_type which returns Option<[u8; 32]>
  const storedId: any = await zkVerifier.view('get_image_id_for_type', {
    proof_type: 'IncomeThreshold',
  });

  t.deepEqual(storedId, mockImageId);
  console.log('✅ Image ID registered');
});

test.serial('owner can change verification mode', async (t) => {
  // Switch to Groth16
  await owner.call(zkVerifier, 'set_verification_mode', {
    mode: 'Groth16',
  });

  let mode: any = await zkVerifier.view('get_verification_mode', {});
  t.is(mode, 'Groth16');
  console.log('✅ Switched to Groth16 mode');

  // Switch back to DevMode for other tests
  await owner.call(zkVerifier, 'set_verification_mode', {
    mode: 'DevMode',
  });

  mode = await zkVerifier.view('get_verification_mode', {});
  t.is(mode, 'DevMode');
  console.log('✅ Switched back to DevMode');
});

// ==================== STATISTICS ====================

test.serial('can get contract statistics', async (t) => {
  // get_stats returns (u32, u64, U128) as a tuple
  const stats: any = await payroll.view('get_stats', {});

  t.truthy(stats);
  // Stats is returned as array: [employee_count, total_payments, total_paid]
  t.true(Array.isArray(stats));
  t.is(stats.length, 3);

  const [employeeCount, totalPayments, totalPaid] = stats;
  console.log(`✅ Stats: ${employeeCount} employees, ${totalPayments} payments, ${totalPaid} paid`);
});

console.log('\n📝 Basic infrastructure tests complete. Add more tests incrementally.\n');
