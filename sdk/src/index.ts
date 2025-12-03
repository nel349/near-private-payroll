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
export { Commitment, generateCommitment, verifyCommitment } from './crypto';
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

// Re-export NEAR Intents SDK widgets and utilities for frontend integration
export {
  SwapWidget,
  WithdrawWidget,
  DepositWidget,
  AccountWidget,
  createSwapIntentMessage,
  createWithdrawIntentMessage,
  formatSignedIntent,
  formatUserIdentity,
  type BaseTokenInfo,
  type UnifiedTokenInfo,
  ChainType,
} from '@defuse-protocol/defuse-sdk';
