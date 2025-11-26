/**
 * Type definitions for NEAR Private Payroll SDK
 */

/** Employment status */
export enum EmploymentStatus {
  Active = 'Active',
  OnLeave = 'OnLeave',
  Terminated = 'Terminated',
}

/** Employee record */
export interface Employee {
  /** Employee's NEAR account */
  account_id: string;
  /** Encrypted name (only employee can decrypt) */
  encrypted_name: number[];
  /** Encrypted salary amount */
  encrypted_salary: number[];
  /** Employment status */
  status: EmploymentStatus;
  /** Start timestamp (nanoseconds) */
  start_date: string;
  /** Public key for encryption */
  public_key: number[];
}

/** Encrypted payment record */
export interface EncryptedPayment {
  /** Timestamp of payment */
  timestamp: string;
  /** Encrypted amount */
  encrypted_amount: number[];
  /** Pedersen commitment to amount */
  commitment: number[];
  /** Payment period (e.g., "2024-01") */
  period: string;
}

/** Disclosure type for third-party verification */
export type DisclosureType =
  | { IncomeAboveThreshold: { threshold: string } }
  | { IncomeRange: { min: string; max: string } }
  | { EmploymentStatus: {} }
  | { FullAudit: {} };

/** Disclosure authorization */
export interface Disclosure {
  /** Who can verify */
  verifier: string;
  /** Type of disclosure */
  disclosure_type: DisclosureType;
  /** Expiration timestamp */
  expires_at: string;
  /** Is active */
  active: boolean;
}

/** Income proof types */
export enum IncomeProofType {
  /** Income >= threshold */
  AboveThreshold = 'AboveThreshold',
  /** min <= Income <= max */
  InRange = 'InRange',
  /** Average income >= threshold */
  AverageAboveThreshold = 'AverageAboveThreshold',
  /** Credit score >= threshold */
  CreditScore = 'CreditScore',
}

/** Verified income proof record */
export interface VerifiedIncomeProof {
  /** Employee who submitted */
  employee_id: string;
  /** Type of proof */
  proof_type: IncomeProofType;
  /** Public parameters */
  public_params: number[];
  /** Verification timestamp */
  verified_at: string;
  /** Verifier who confirmed */
  verified_by: string;
  /** Proof hash */
  proof_hash: number[];
}

/** Contract statistics */
export interface ContractStats {
  totalEmployees: number;
  totalPayments: number;
  companyBalance: string;
}

/** wZEC burn event */
export interface BurnForZcashEvent {
  burner: string;
  amount: string;
  zcash_shielded_address: string;
  nonce: number;
}

/** Income threshold proof output */
export interface IncomeThresholdOutput {
  threshold: string;
  meets_threshold: boolean;
  payment_count: number;
}

/** Income range proof output */
export interface IncomeRangeOutput {
  min: string;
  max: string;
  in_range: boolean;
}

/** Credit score proof output */
export interface CreditScoreOutput {
  threshold: number;
  meets_threshold: boolean;
}

/** Verification record */
export interface VerificationRecord {
  submitter: string;
  proof_type: string;
  receipt_hash: number[];
  public_outputs: number[];
  verified_at: string;
  success: boolean;
}

// ==================== CROSS-CHAIN INTENTS TYPES ====================

/** Supported destination chains for cross-chain operations */
export enum DestinationChain {
  /** Zcash mainnet (shielded recommended for privacy) */
  Zcash = 'Zcash',
  /** Solana mainnet */
  Solana = 'Solana',
  /** Ethereum mainnet */
  Ethereum = 'Ethereum',
  /** Bitcoin mainnet */
  Bitcoin = 'Bitcoin',
  /** NEAR (same chain, no bridge needed) */
  Near = 'Near',
}

/** Zcash address type */
export enum ZcashAddressType {
  /** Sapling shielded address (zs...) - recommended for privacy */
  Shielded = 'Shielded',
  /** Transparent address (t1... or t3...) - like Bitcoin */
  Transparent = 'Transparent',
}

/** Deposit status */
export enum DepositStatus {
  Pending = 'Pending',
  Confirmed = 'Confirmed',
  Forwarded = 'Forwarded',
  Failed = 'Failed',
}

/** Withdrawal status */
export enum WithdrawalStatus {
  Pending = 'Pending',
  IntentCreated = 'IntentCreated',
  Processing = 'Processing',
  Completed = 'Completed',
  Failed = 'Failed',
}

/** Pending cross-chain deposit */
export interface PendingDeposit {
  /** Source chain */
  source_chain: DestinationChain;
  /** Source transaction hash */
  source_tx_hash: string;
  /** Amount in smallest unit */
  amount: string;
  /** Destination (company account on NEAR) */
  destination: string;
  /** Timestamp */
  created_at: string;
  /** Status */
  status: DepositStatus;
}

/** Pending cross-chain withdrawal */
export interface PendingWithdrawal {
  /** NEAR account initiating withdrawal */
  initiator: string;
  /** Destination chain */
  destination_chain: DestinationChain;
  /** Destination address on target chain */
  destination_address: string;
  /** Token to withdraw */
  token: string;
  /** Amount in smallest unit */
  amount: string;
  /** Created timestamp */
  created_at: string;
  /** Status */
  status: WithdrawalStatus;
  /** Intent ID (after submission to intents protocol) */
  intent_id?: string;
}

/** Chain configuration */
export interface ChainConfig {
  /** Chain identifier */
  chain: DestinationChain;
  /** Is enabled for deposits */
  deposit_enabled: boolean;
  /** Is enabled for withdrawals */
  withdrawal_enabled: boolean;
  /** Minimum withdrawal amount */
  min_withdrawal: string;
  /** Maximum withdrawal amount (0 = unlimited) */
  max_withdrawal: string;
  /** Fee basis points (100 = 1%) */
  fee_bps: number;
  /** Bridge contract/address for this chain */
  bridge_address: string;
}

/** Intents adapter statistics */
export interface IntentsAdapterStats {
  totalDeposits: number;
  totalWithdrawals: number;
  withdrawalNonce: number;
}
