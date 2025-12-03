/**
 * NEAR Private Payroll SDK
 *
 * TypeScript SDK for interacting with the NEAR Private Payroll system.
 *
 * @example
 * ```typescript
 * import { PrivatePayroll, WZecToken, ZkVerifier, IntentsAdapterSDK } from '@near-private-payroll/sdk';
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
 * // Employee withdraws to NEAR wallet
 * await payroll.withdraw('1000');
 *
 * // Employee withdraws to Zcash shielded address (cross-chain)
 * await payroll.withdrawViaIntents('100000000', DestinationChain.Zcash, 'zs1...');
 * ```
 */

export { PrivatePayroll } from './payroll';
export { WZecToken } from './wzec';
export { ZkVerifier, ProofType } from './verifier';
export {
  Commitment,
  generateCommitment,
  verifyCommitment,
  generateBlinding,
  generateSalaryCommitment,
  generateBalanceCommitment,
  generateRSAKeypair,
  encryptWithPublicKey,
  decryptWithPrivateKey,
  toHex,
  fromHex,
  leBytesToBigint,
} from './crypto';
export {
  IntentsAdapterSDK,
  buildDepositMessage,
  parseWithdrawalId,
} from './intents';
export {
  Employee,
  EncryptedPayment,
  Disclosure,
  DisclosureType,
  IncomeProofType,
  VerifiedIncomeProof,
  EmploymentStatus,
  // Cross-chain types
  DestinationChain,
  ZcashAddressType,
  DepositStatus,
  WithdrawalStatus,
  PendingDeposit,
  PendingWithdrawal,
  ChainConfig,
  IntentsAdapterStats,
  // DeFi types
  AutoLendConfig,
} from './types';

// Note: @defuse-protocol/defuse-sdk widgets are available but not re-exported
// due to module resolution issues. Import directly from '@defuse-protocol/defuse-sdk' if needed.
