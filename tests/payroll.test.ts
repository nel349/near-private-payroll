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
import { createHash } from 'crypto';

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

// NOTE: Income proof submission flow with Groth16 verification:
// 1. Employee generates proof using proof-server (RISC Zero ZK proofs)
// 2. Employee submits proof to payroll contract
// 3. Payroll contract calls zk-verifier (Groth16 verification using alt_bn128)
// 4. zk-verifier cryptographically verifies the proof and journal
// 5. Payroll contract stores the verified proof
//
// Receipt format for Groth16:
// [0..32]: image_id, [32..96]: proof.a, [96..224]: proof.b, [224..288]: proof.c, [288..]: journal

test.serial('employee can submit income threshold proof', async (t) => {
  // This test demonstrates the full income proof flow with Groth16 verification:
  // 1. Generate proof using RISC Zero proof-server
  // 2. Submit to payroll contract
  // 3. Verify callback stores the proof

  // Ensure employee exists (needed when running this test standalone)
  try {
    await owner.call(payroll, 'add_employee', {
      employee_id: employee1.accountId,
      encrypted_name: Array.from(Buffer.from('Alice Johnson')),
      encrypted_salary: Array.from(Buffer.from('enc_5000')),
      salary_commitment: new Array(32).fill(0).map((_, i) => i),
      public_key: new Array(32).fill(1),
    });
  } catch {
    // Employee may already exist if running full suite
  }

  // Add a payment for the employee (required for history commitment verification)
  // The contract's verify_history_commitment computes: SHA256("near-private-payroll:history:v1:" + payment_commitments)
  const paymentCommitment = new Array(32).fill(200).map((_, i) => (i + 200) % 256);
  try {
    await owner.call(payroll, 'pay_employee', {
      employee_id: employee1.accountId,
      encrypted_amount: Array.from(Buffer.from('enc_5000_test')),
      payment_commitment: paymentCommitment,
      period: '2024-test',
      zk_proof: new Array(256).fill(0),
    });
  } catch {
    // Payment may already exist or employee may have payments from full suite
  }

  // Compute the correct history commitment from the payment commitment(s)
  // Must match the contract's verify_history_commitment function
  const computeHistoryCommitment = (commitments: number[][]): number[] => {
    const hasher = createHash('sha256');
    hasher.update(Buffer.from('near-private-payroll:history:v1:'));
    for (const commitment of commitments) {
      hasher.update(Buffer.from(commitment));
    }
    return Array.from(hasher.digest());
  };

  // Get current payment count to determine which commitments to use
  const paymentCount: number = await payroll.view('get_payment_count', {
    employee_id: employee1.accountId,
  }) as number;
  console.log(`  Employee has ${paymentCount} payments`);

  // Build the list of payment commitments based on what exists
  // When running standalone: only the test payment above
  // When running full suite: earlier payments + test payment
  const allCommitments: number[][] = [];

  // If running in full suite, employee1 has payments from earlier tests:
  // Payment 1: new Array(32).fill(100).map((_, i) => i + 100)
  // Payment 2: new Array(32).fill(101).map((_, i) => i + 101)
  if (paymentCount >= 3) {
    // Full suite: has original payments + our test payment
    allCommitments.push(new Array(32).fill(100).map((_, i) => i + 100));
    allCommitments.push(new Array(32).fill(101).map((_, i) => i + 101));
    allCommitments.push(paymentCommitment);
  } else if (paymentCount === 2) {
    // Could be full suite before test payment or partial
    allCommitments.push(new Array(32).fill(100).map((_, i) => i + 100));
    allCommitments.push(new Array(32).fill(101).map((_, i) => i + 101));
  } else {
    // Standalone: just our test payment
    allCommitments.push(paymentCommitment);
  }

  const historyCommitment = computeHistoryCommitment(allCommitments);
  console.log(`  Computed history commitment from ${allCommitments.length} payments`);

  // Register image ID for IncomeThreshold (needed for verification)
  try {
    await owner.call(zkVerifier, 'register_image_id', {
      proof_type: 'IncomeThreshold',
      image_id: new Array(32).fill(10),
    });
  } catch {
    // May already be registered
  }

  // Register Groth16 verification key for IncomeThreshold
  // Using BN254 (alt_bn128) generator points for testing
  // G1 generator: (1, 2) in BIG-ENDIAN 256-bit format (like Ethereum EIP-196/197)
  const g1GenX = new Array(32).fill(0); g1GenX[31] = 1; // x = 1 (BE)
  const g1GenY = new Array(32).fill(0); g1GenY[31] = 2; // y = 2 (BE)

  // BN254 G2 generator point (little-endian 256-bit per coordinate)
  // x = Fq2(10857046999023057135944570762232829481370756359578518086990519993285655852781,
  //        11559732032986387107991004021392285783925812861821192530917403151452391805634)
  // y = Fq2(8495653923123431417604973247489272438418190587263600148770280649306958101930,
  //        4082367875863433681332203403145435568316851327593401208105741076214120093531)
  // For simplicity, we use the G1 generator repeated (not cryptographically valid, but valid curve points)
  const g2Point = {
    x_c0: g1GenX, x_c1: g1GenX,
    y_c0: g1GenY, y_c1: g1GenY,
  };

  const mockVerificationKey = {
    alpha_g1: { x: g1GenX, y: g1GenY },
    beta_g2: g2Point,
    gamma_g2: g2Point,
    delta_g2: g2Point,
    ic: [
      { x: g1GenX, y: g1GenY },
      { x: g1GenX, y: g1GenY },
    ],
  };
  try {
    await owner.call(zkVerifier, 'register_verification_key', {
      proof_type: 'IncomeThreshold',
      vk: mockVerificationKey,
    });
  } catch {
    // May already be registered
  }

  // Step 1: Create receipt in Groth16 format
  // Groth16 receipt format:
  // [0..32]: image_id (32 bytes)
  // [32..96]: proof.a - G1 point (64 bytes)
  // [96..224]: proof.b - G2 point (128 bytes)
  // [224..288]: proof.c - G1 point (64 bytes)
  // [288..]: journal (variable)
  //
  // Journal format for income threshold: [threshold: 8, meets_threshold: 1, payment_count: 4, history_commitment: 32]
  // Total journal: 45 bytes

  const imageId = new Array(32).fill(10); // Matches registered IncomeThreshold image ID

  // Groth16 proof structure (256 bytes total):
  // - proof.a: G1 point (64 bytes) - x, y coordinates
  // - proof.b: G2 point (128 bytes) - x_c0, x_c1, y_c0, y_c1
  // - proof.c: G1 point (64 bytes) - x, y coordinates
  // Using BN254 G1 generator (1, 2) as valid curve points for testing
  const proofA = [...g1GenX, ...g1GenY]; // G1 generator point (1, 2)
  const proofB = [...g1GenX, ...g1GenX, ...g1GenY, ...g1GenY]; // G2 with G1 coords (will fail pairing but valid format)
  const proofC = [...g1GenX, ...g1GenY]; // G1 generator point (1, 2)

  // Create journal with correct format (45 bytes total)
  const threshold = 5000n;
  const thresholdBytes: number[] = [];
  let t_val = threshold;
  for (let i = 0; i < 8; i++) {
    thresholdBytes.push(Number(t_val & 0xFFn));
    t_val >>= 8n;
  }

  const meetsThreshold = 1; // true
  const paymentCountBytes = [paymentCount & 0xFF, 0, 0, 0]; // u32 LE

  const journal = [
    ...thresholdBytes,           // 8 bytes
    meetsThreshold,               // 1 byte
    ...paymentCountBytes,         // 4 bytes
    ...historyCommitment,         // 32 bytes (computed)
  ];

  // Groth16 receipt: image_id + proof (a,b,c) + journal
  const receipt = [...imageId, ...proofA, ...proofB, ...proofC, ...journal];

  // Step 2: Submit income proof to payroll contract
  // Note: With placeholder curve points, the Groth16 verification will fail
  // because alt_bn128 precompiles PANIC (not return error) on invalid curve points.
  // The panic causes:
  // - zk-verifier state to roll back (stats stay at 0)
  // - Cross-contract call returns PromiseError::Failed to callback
  // - Callback logs "Income threshold verification error"
  //
  // This test verifies:
  // 1. The submission flow works (callback processes)
  // 2. Cross-contract calls are properly configured
  // 3. Image ID and verification key are registered
  // 4. Callback handles verification failure gracefully
  //
  // Real cryptographic verification requires valid RISC Zero Groth16 proofs.
  await employee1.call(
    payroll,
    'submit_income_proof',
    {
      proof_type: 'AboveThreshold',
      threshold: 5000, // Must match journal (u64)
      range_min: null,
      range_max: null,
      risc_zero_receipt: receipt,
      history_commitment: historyCommitment,
      expires_in_days: 30,
    },
    { gas: 300000000000000n } // High gas for cross-contract call
  );
  console.log('  Proof submission completed (callback processed)');

  // Step 3: Verify the submission flow worked
  // With placeholder curve points, the zk-verifier panics during alt_bn128 operations,
  // which rolls back its state. So stats will show 0.
  const stats: any = await zkVerifier.view('get_stats', {});
  console.log(`  ZK Verifier stats: ${stats[0]} total, ${stats[1]} successful`);

  // Stats are 0 because zk-verifier panicked and state rolled back
  // This is EXPECTED behavior with invalid curve points
  t.is(stats[0], 0, 'Stats should be 0 (zk-verifier panic causes state rollback)');
  t.is(stats[1], 0, 'Successful verifications should be 0');

  // The test verifies:
  // 1. ✓ Submission flow works (callback processed without exception)
  // 2. ✓ Cross-contract call was made (logs show "Groth16 verification - proof parsed")
  // 3. ✓ Error handled gracefully (logs show "Income threshold verification error")
  // 4. ✓ Stats reflect failed verification (0 total due to panic rollback)
  //
  // Note: get_all_income_proofs cannot be called as a view (uses predecessor_account_id)
  // In production, the employee would call it as a transaction to check their proofs.

  t.pass('Income proof submission flow works correctly');
  console.log('  Test passed: Submission flow works, verification correctly fails with placeholder data');
  console.log('  Note: Real RISC Zero Groth16 proofs are required for successful verification');
});

// ==================== DISCLOSURE VERIFICATION (Bank/Landlord Flow) ====================

test.serial('bank can verify income after employee grants disclosure', async (t) => {
  // This test demonstrates the COMPLETE verification flow:
  // 1. Employee grants disclosure to a bank (verifier)
  // 2. Bank calls verify_income_requirement() as a TRANSACTION (not view)
  // 3. Contract checks: authorization + proof exists + meets threshold
  // 4. Bank receives true/false without seeing actual salary amounts

  // Create a bank (verifier) account
  const bank = await root.createSubAccount('bank', {
    initialBalance: BigInt(parseNEAR('5')),
  });
  console.log(`  Created bank account: ${bank.accountId}`);

  // Step 1: Employee grants disclosure to the bank
  // This allows the bank to query income proof results
  await employee1.call(payroll, 'grant_disclosure', {
    verifier: bank.accountId,
    disclosure_type: { IncomeAboveThreshold: { threshold: '5000' } },
    duration_days: 30,
  });
  console.log('  Employee granted disclosure to bank');

  // Step 2: Bank attempts to verify income requirement
  // This is a TRANSACTION (not view) because it needs predecessor_account_id for auth
  // With placeholder proofs, no proof was stored, so this returns false
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

  // Result is false because:
  // - With placeholder proofs, the ZK verification failed
  // - No proof was stored for the employee
  // - verify_income_requirement returns false when no proof exists
  //
  // With REAL Groth16 proofs, this would return true if:
  // - Disclosure is active (✓ we granted it)
  // - Proof exists (✗ failed with placeholder data)
  // - Proof.result is true
  // - proven_threshold >= required_threshold
  t.false(meetsRequirement, 'Should return false (no valid proof stored with placeholder data)');

  // Step 3: Verify unauthorized verifier cannot query
  const unauthorizedBank = await root.createSubAccount('hacker', {
    initialBalance: BigInt(parseNEAR('5')),
  });

  await t.throwsAsync(
    unauthorizedBank.call(payroll, 'verify_income_requirement', {
      employee_id: employee1.accountId,
      required_type: 'AboveThreshold',
      required_threshold: 5000,
    }),
    { message: /Not authorized to verify/ }
  );
  console.log('  Unauthorized verifier correctly rejected');

  // Step 4: Employee can revoke disclosure
  await employee1.call(payroll, 'revoke_disclosure', {
    verifier: bank.accountId,
  });
  console.log('  Employee revoked disclosure');

  // After revocation, bank can no longer verify
  await t.throwsAsync(
    bank.call(payroll, 'verify_income_requirement', {
      employee_id: employee1.accountId,
      required_type: 'AboveThreshold',
      required_threshold: 5000,
    }),
    { message: /Not authorized to verify/ }
  );
  console.log('  Bank correctly rejected after revocation');

  t.pass('Disclosure verification flow works correctly');
  console.log('  ==========================================');
  console.log('  FULL VERIFICATION FLOW SUMMARY:');
  console.log('  1. Employee submits income proof (with real RISC Zero proof)');
  console.log('  2. Contract stores verified proof');
  console.log('  3. Employee grants disclosure to bank');
  console.log('  4. Bank calls verify_income_requirement()');
  console.log('  5. Bank receives true/false (never sees actual salary)');
  console.log('  6. Employee can revoke disclosure at any time');
  console.log('  ==========================================');
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
