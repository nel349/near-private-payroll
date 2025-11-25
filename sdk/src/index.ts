/**
 * NEAR Private Payroll SDK
 *
 * TypeScript SDK for interacting with the NEAR Private Payroll system.
 *
 * @example
 * ```typescript
 * import { PrivatePayroll, WZecToken, ZkVerifier } from '@near-private-payroll/sdk';
 *
 * // Initialize
 * const payroll = new PrivatePayroll(near, 'payroll.near');
 *
 * // Add employee (company)
 * await payroll.addEmployee('alice.near', encryptedName, encryptedSalary, commitment, publicKey);
 *
 * // Pay employee with ZK proof
 * await payroll.payEmployee('alice.near', encryptedAmount, commitment, '2024-01', proof);
 *
 * // Employee withdraws
 * await payroll.withdraw('1000');
 * ```
 */

export { PrivatePayroll } from './payroll';
export { WZecToken } from './wzec';
export { ZkVerifier, ProofType } from './verifier';
export { Commitment, generateCommitment, verifyCommitment } from './crypto';
export {
  Employee,
  EncryptedPayment,
  Disclosure,
  DisclosureType,
  IncomeProofType,
  VerifiedIncomeProof,
  EmploymentStatus,
} from './types';
