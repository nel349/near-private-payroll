/**
 * NEAR Private Payroll Contract Interface
 */

import { Contract, Near, Account } from 'near-api-js';
import {
  Employee,
  EmploymentStatus,
  EncryptedPayment,
  Disclosure,
  DisclosureType,
  IncomeProofType,
  VerifiedIncomeProof,
  ContractStats,
} from './types';

/** Contract methods interface */
interface PayrollContractMethods {
  // Change methods
  ft_on_transfer: (args: {
    sender_id: string;
    amount: string;
    msg: string;
  }) => Promise<string>;
  add_employee: (args: {
    employee_id: string;
    encrypted_name: number[];
    encrypted_salary: number[];
    salary_commitment: number[];
    public_key: number[];
  }) => Promise<void>;
  pay_employee: (args: {
    employee_id: string;
    encrypted_amount: number[];
    payment_commitment: number[];
    period: string;
    zk_proof: number[];
  }) => Promise<void>;
  update_employee_status: (args: {
    employee_id: string;
    status: EmploymentStatus;
  }) => Promise<void>;
  withdraw: (args: { amount: string }) => Promise<void>;
  grant_disclosure: (args: {
    verifier: string;
    disclosure_type: DisclosureType;
    duration_days: number;
  }) => Promise<void>;
  revoke_disclosure: (args: { verifier: string }) => Promise<void>;
  register_trusted_verifier: (args: { verifier: string }) => Promise<void>;
  remove_trusted_verifier: (args: { verifier: string }) => Promise<void>;
  submit_income_proof: (args: {
    proof_type: IncomeProofType;
    public_params: number[];
    risc_zero_receipt: number[];
  }) => Promise<void>;

  // View methods
  get_employee: (args: { employee_id: string }) => Promise<Employee | null>;
  get_payment_count: (args: { employee_id: string }) => Promise<number>;
  get_balance: (args: { employee_id: string }) => Promise<string>;
  get_company_balance: () => Promise<string>;
  get_stats: () => Promise<[number, number, string]>;
  is_trusted_verifier: (args: { account_id: string }) => Promise<boolean>;
  get_income_proof: (args: { index: number }) => Promise<VerifiedIncomeProof | null>;
  get_income_proof_count: () => Promise<number>;
  verify_income_proof_for_disclosure: (args: {
    employee_id: string;
    proof_index: number;
  }) => Promise<boolean>;
}

/**
 * NEAR Private Payroll SDK
 *
 * Provides a TypeScript interface to the payroll contract.
 */
export class PrivatePayroll {
  private contract: Contract & PayrollContractMethods;
  private account: Account;

  constructor(account: Account, contractId: string) {
    this.account = account;
    this.contract = new Contract(account, contractId, {
      viewMethods: [
        'get_employee',
        'get_payment_count',
        'get_balance',
        'get_company_balance',
        'get_stats',
        'is_trusted_verifier',
        'get_income_proof',
        'get_income_proof_count',
        'verify_income_proof_for_disclosure',
      ],
      changeMethods: [
        'ft_on_transfer',
        'add_employee',
        'pay_employee',
        'update_employee_status',
        'withdraw',
        'grant_disclosure',
        'revoke_disclosure',
        'register_trusted_verifier',
        'remove_trusted_verifier',
        'submit_income_proof',
      ],
    }) as Contract & PayrollContractMethods;
  }

  // ==================== COMPANY OPERATIONS ====================

  /**
   * Add a new employee to the payroll
   *
   * @param employeeId - Employee's NEAR account ID
   * @param encryptedName - Encrypted employee name
   * @param encryptedSalary - Encrypted salary amount
   * @param salaryCommitment - Pedersen commitment to salary
   * @param publicKey - Employee's public key for encryption
   */
  async addEmployee(
    employeeId: string,
    encryptedName: Uint8Array,
    encryptedSalary: Uint8Array,
    salaryCommitment: Uint8Array,
    publicKey: Uint8Array
  ): Promise<void> {
    await this.contract.add_employee({
      employee_id: employeeId,
      encrypted_name: Array.from(encryptedName),
      encrypted_salary: Array.from(encryptedSalary),
      salary_commitment: Array.from(salaryCommitment),
      public_key: Array.from(publicKey),
    });
  }

  /**
   * Pay an employee with ZK proof verification
   *
   * @param employeeId - Employee's NEAR account ID
   * @param encryptedAmount - Encrypted payment amount
   * @param paymentCommitment - Pedersen commitment to payment
   * @param period - Payment period (e.g., "2024-01")
   * @param zkProof - RISC Zero proof that payment matches salary
   */
  async payEmployee(
    employeeId: string,
    encryptedAmount: Uint8Array,
    paymentCommitment: Uint8Array,
    period: string,
    zkProof: Uint8Array
  ): Promise<void> {
    await this.contract.pay_employee({
      employee_id: employeeId,
      encrypted_amount: Array.from(encryptedAmount),
      payment_commitment: Array.from(paymentCommitment),
      period,
      zk_proof: Array.from(zkProof),
    });
  }

  /**
   * Update an employee's status
   */
  async updateEmployeeStatus(
    employeeId: string,
    status: EmploymentStatus
  ): Promise<void> {
    await this.contract.update_employee_status({
      employee_id: employeeId,
      status,
    });
  }

  /**
   * Register a trusted verifier
   */
  async registerTrustedVerifier(verifier: string): Promise<void> {
    await this.contract.register_trusted_verifier({ verifier });
  }

  /**
   * Remove a trusted verifier
   */
  async removeTrustedVerifier(verifier: string): Promise<void> {
    await this.contract.remove_trusted_verifier({ verifier });
  }

  // ==================== EMPLOYEE OPERATIONS ====================

  /**
   * Withdraw employee balance
   *
   * @param amount - Amount to withdraw (as string for large numbers)
   */
  async withdraw(amount: string): Promise<void> {
    await this.contract.withdraw({ amount });
  }

  /**
   * Grant disclosure to a third party
   *
   * @param verifier - Verifier's NEAR account ID
   * @param disclosureType - Type of disclosure to grant
   * @param durationDays - How long the disclosure is valid
   */
  async grantDisclosure(
    verifier: string,
    disclosureType: DisclosureType,
    durationDays: number
  ): Promise<void> {
    await this.contract.grant_disclosure({
      verifier,
      disclosure_type: disclosureType,
      duration_days: durationDays,
    });
  }

  /**
   * Revoke disclosure from a verifier
   */
  async revokeDisclosure(verifier: string): Promise<void> {
    await this.contract.revoke_disclosure({ verifier });
  }

  /**
   * Submit an income proof
   *
   * @param proofType - Type of income proof
   * @param publicParams - Public parameters for the proof
   * @param receipt - RISC Zero receipt (proof)
   */
  async submitIncomeProof(
    proofType: IncomeProofType,
    publicParams: Uint8Array,
    receipt: Uint8Array
  ): Promise<void> {
    await this.contract.submit_income_proof({
      proof_type: proofType,
      public_params: Array.from(publicParams),
      risc_zero_receipt: Array.from(receipt),
    });
  }

  // ==================== VIEW METHODS ====================

  /**
   * Get employee information
   */
  async getEmployee(employeeId: string): Promise<Employee | null> {
    return this.contract.get_employee({ employee_id: employeeId });
  }

  /**
   * Get number of payments for an employee
   */
  async getPaymentCount(employeeId: string): Promise<number> {
    return this.contract.get_payment_count({ employee_id: employeeId });
  }

  /**
   * Get employee balance
   */
  async getBalance(employeeId: string): Promise<string> {
    return this.contract.get_balance({ employee_id: employeeId });
  }

  /**
   * Get company balance
   */
  async getCompanyBalance(): Promise<string> {
    return this.contract.get_company_balance();
  }

  /**
   * Get contract statistics
   */
  async getStats(): Promise<ContractStats> {
    const [totalEmployees, totalPayments, companyBalance] =
      await this.contract.get_stats();
    return {
      totalEmployees,
      totalPayments,
      companyBalance,
    };
  }

  /**
   * Check if an account is a trusted verifier
   */
  async isTrustedVerifier(accountId: string): Promise<boolean> {
    return this.contract.is_trusted_verifier({ account_id: accountId });
  }

  /**
   * Get income proof by index
   */
  async getIncomeProof(index: number): Promise<VerifiedIncomeProof | null> {
    return this.contract.get_income_proof({ index });
  }

  /**
   * Get total income proof count
   */
  async getIncomeProofCount(): Promise<number> {
    return this.contract.get_income_proof_count();
  }

  /**
   * Verify income proof for disclosure (as third party)
   */
  async verifyIncomeProofForDisclosure(
    employeeId: string,
    proofIndex: number
  ): Promise<boolean> {
    return this.contract.verify_income_proof_for_disclosure({
      employee_id: employeeId,
      proof_index: proofIndex,
    });
  }
}
