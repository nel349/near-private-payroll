/**
 * ZK Verifier Contract Interface
 */

import { Contract, Account } from 'near-api-js';
import {
  IncomeThresholdOutput,
  IncomeRangeOutput,
  CreditScoreOutput,
  VerificationRecord,
} from './types';

/** Proof types supported by the verifier */
export enum ProofType {
  PaymentProof = 'PaymentProof',
  IncomeThreshold = 'IncomeThreshold',
  IncomeRange = 'IncomeRange',
  AverageIncome = 'AverageIncome',
  CreditScore = 'CreditScore',
  BalanceProof = 'BalanceProof',
}

/** Contract methods interface */
interface VerifierContractMethods {
  // Change methods
  register_image_id: (args: {
    proof_type: ProofType;
    image_id: number[];
  }) => Promise<void>;
  transfer_ownership: (args: { new_owner: string }) => Promise<void>;
  verify_payment_proof: (args: {
    receipt: number[];
    salary_commitment: number[];
    payment_commitment: number[];
  }) => Promise<boolean>;
  verify_income_threshold: (args: {
    receipt: number[];
    expected_threshold: string;
  }) => Promise<IncomeThresholdOutput>;
  verify_income_range: (args: {
    receipt: number[];
    expected_min: string;
    expected_max: string;
  }) => Promise<IncomeRangeOutput>;
  verify_credit_score: (args: {
    receipt: number[];
    expected_threshold: number;
  }) => Promise<CreditScoreOutput>;

  // View methods
  get_owner: () => Promise<string>;
  get_image_id_for_type: (args: { proof_type: ProofType }) => Promise<number[] | null>;
  get_verification: (args: {
    receipt_hash: number[];
  }) => Promise<VerificationRecord | null>;
  get_stats: () => Promise<[number, number]>;
}

/**
 * ZK Verifier SDK
 *
 * Provides a TypeScript interface to the ZK verifier contract.
 */
export class ZkVerifier {
  private contract: Contract & VerifierContractMethods;
  private account: Account;

  constructor(account: Account, contractId: string) {
    this.account = account;
    this.contract = new Contract(account, contractId, {
      viewMethods: [
        'get_owner',
        'get_image_id_for_type',
        'get_verification',
        'get_stats',
      ],
      changeMethods: [
        'register_image_id',
        'transfer_ownership',
        'verify_payment_proof',
        'verify_income_threshold',
        'verify_income_range',
        'verify_credit_score',
      ],
    }) as Contract & VerifierContractMethods;
  }

  // ==================== ADMIN OPERATIONS ====================

  /**
   * Register an image ID for a proof type
   *
   * @param proofType - Type of proof
   * @param imageId - RISC Zero image ID (circuit hash)
   */
  async registerImageId(
    proofType: ProofType,
    imageId: Uint8Array
  ): Promise<void> {
    if (imageId.length !== 32) {
      throw new Error('Image ID must be 32 bytes');
    }
    await this.contract.register_image_id({
      proof_type: proofType,
      image_id: Array.from(imageId),
    });
  }

  /**
   * Transfer ownership
   */
  async transferOwnership(newOwner: string): Promise<void> {
    await this.contract.transfer_ownership({ new_owner: newOwner });
  }

  // ==================== VERIFICATION OPERATIONS ====================

  /**
   * Verify a payment proof
   *
   * @param receipt - RISC Zero receipt
   * @param salaryCommitment - Expected salary commitment
   * @param paymentCommitment - Expected payment commitment
   * @returns True if proof is valid and amounts match
   */
  async verifyPaymentProof(
    receipt: Uint8Array,
    salaryCommitment: Uint8Array,
    paymentCommitment: Uint8Array
  ): Promise<boolean> {
    return this.contract.verify_payment_proof({
      receipt: Array.from(receipt),
      salary_commitment: Array.from(salaryCommitment),
      payment_commitment: Array.from(paymentCommitment),
    });
  }

  /**
   * Verify an income threshold proof
   *
   * @param receipt - RISC Zero receipt
   * @param expectedThreshold - Expected threshold value
   * @returns Proof output with threshold and result
   */
  async verifyIncomeThreshold(
    receipt: Uint8Array,
    expectedThreshold: bigint | string
  ): Promise<IncomeThresholdOutput> {
    return this.contract.verify_income_threshold({
      receipt: Array.from(receipt),
      expected_threshold: expectedThreshold.toString(),
    });
  }

  /**
   * Verify an income range proof
   *
   * @param receipt - RISC Zero receipt
   * @param expectedMin - Expected minimum
   * @param expectedMax - Expected maximum
   * @returns Proof output with range and result
   */
  async verifyIncomeRange(
    receipt: Uint8Array,
    expectedMin: bigint | string,
    expectedMax: bigint | string
  ): Promise<IncomeRangeOutput> {
    return this.contract.verify_income_range({
      receipt: Array.from(receipt),
      expected_min: expectedMin.toString(),
      expected_max: expectedMax.toString(),
    });
  }

  /**
   * Verify a credit score proof
   *
   * @param receipt - RISC Zero receipt
   * @param expectedThreshold - Expected score threshold
   * @returns Proof output with threshold and result
   */
  async verifyCreditScore(
    receipt: Uint8Array,
    expectedThreshold: number
  ): Promise<CreditScoreOutput> {
    return this.contract.verify_credit_score({
      receipt: Array.from(receipt),
      expected_threshold: expectedThreshold,
    });
  }

  // ==================== VIEW METHODS ====================

  /**
   * Get owner
   */
  async getOwner(): Promise<string> {
    return this.contract.get_owner();
  }

  /**
   * Get image ID for a proof type
   */
  async getImageIdForType(proofType: ProofType): Promise<Uint8Array | null> {
    const result = await this.contract.get_image_id_for_type({
      proof_type: proofType,
    });
    return result ? new Uint8Array(result) : null;
  }

  /**
   * Get verification record by receipt hash
   */
  async getVerification(receiptHash: Uint8Array): Promise<VerificationRecord | null> {
    return this.contract.get_verification({
      receipt_hash: Array.from(receiptHash),
    });
  }

  /**
   * Get verification statistics
   */
  async getStats(): Promise<{ total: number; successful: number }> {
    const [total, successful] = await this.contract.get_stats();
    return { total, successful };
  }
}
