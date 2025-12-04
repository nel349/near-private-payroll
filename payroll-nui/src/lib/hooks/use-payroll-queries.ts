/**
 * TanStack Query hooks for payroll contract view calls
 *
 * Provides modular, elegant query management with automatic caching and invalidation
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWalletSelector } from "@near-wallet-selector/react-hook";
import { CONFIG } from "@/config/contracts";
import { useState, useEffect } from "react";
import {
  encryptWithPublicKey,
  decryptWithPrivateKey,
  generateBlinding,
  generateSalaryCommitment,
} from "@near-private-payroll/sdk";

// ============================================================================
// Query Keys
// ============================================================================

export const payrollKeys = {
  all: ["payroll"] as const,
  company: (contractId: string) =>
    [...payrollKeys.all, "company", contractId] as const,
  companyBalance: (contractId: string) =>
    [...payrollKeys.company(contractId), "balance"] as const,
  companyStats: (contractId: string) =>
    [...payrollKeys.company(contractId), "stats"] as const,
  companyEmployees: (contractId: string) =>
    [...payrollKeys.company(contractId), "employees"] as const,
  companyPublicKey: (contractId: string) =>
    [...payrollKeys.company(contractId), "public-key"] as const,
  employee: (contractId: string, employeeId: string) =>
    [...payrollKeys.all, "employee", contractId, employeeId] as const,
  employeeData: (contractId: string, employeeId: string) =>
    [...payrollKeys.employee(contractId, employeeId), "data"] as const,
  employeeBalance: (contractId: string, employeeId: string) =>
    [...payrollKeys.employee(contractId, employeeId), "balance"] as const,
  employeePaymentCount: (contractId: string, employeeId: string) =>
    [...payrollKeys.employee(contractId, employeeId), "payment-count"] as const,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert balance from smallest unit (8 decimals) to display format
 */
function formatBalance(balance: string | number): string {
  const balanceStr =
    typeof balance === "string" ? balance : String(balance || "0");
  const balanceNum = parseInt(balanceStr) / 100_000_000;
  return balanceNum.toFixed(8).replace(/\.?0+$/, "");
}

// ============================================================================
// Company Queries
// ============================================================================

/**
 * Query company balance (wZEC in company contract)
 */
export function useCompanyBalance(contractAddress?: string) {
  const { viewFunction } = useWalletSelector();

  return useQuery({
    queryKey: payrollKeys.companyBalance(contractAddress || ""),
    queryFn: async () => {
      if (!contractAddress) throw new Error("Contract address is required");

      console.log("[useCompanyBalance] Fetching balance for:", contractAddress);
      console.log("[useCompanyBalance] wZEC token contract:", CONFIG.wzecToken);

      const balanceResult = await viewFunction({
        contractId: CONFIG.wzecToken,
        method: "ft_balance_of",
        args: { account_id: contractAddress },
      });

      console.log("[useCompanyBalance] Raw balance result:", balanceResult);

      const balance = formatBalance(balanceResult as string | number);
      console.log("[useCompanyBalance] wZEC Balance:", balance, "wZEC");

      return balance;
    },
    enabled: !!contractAddress,
  });
}

/**
 * Query company stats (total employees, total payments)
 */
export function useCompanyStats(contractAddress?: string) {
  const { viewFunction } = useWalletSelector();

  return useQuery({
    queryKey: payrollKeys.companyStats(contractAddress || ""),
    queryFn: async () => {
      if (!contractAddress) throw new Error("Contract address is required");

      console.log("[useCompanyStats] Fetching stats for:", contractAddress);

      const statsResult = await viewFunction({
        contractId: contractAddress,
        method: "get_stats",
        args: {},
      });

      console.log("[useCompanyStats] Raw stats result:", statsResult);

      // Stats returns (total_employees: u32, total_payments: u64, company_balance: U128)
      if (Array.isArray(statsResult) && statsResult.length >= 2) {
        return {
          totalEmployees: Number(statsResult[0]),
          totalPayments: Number(statsResult[1]),
        };
      }

      return { totalEmployees: 0, totalPayments: 0 };
    },
    enabled: !!contractAddress,
  });
}

/**
 * Query company employees list
 * Decrypts employee names locally with company's private key
 *
 * @param contractAddress - The company contract address
 * @param companyKeypair - Optional decrypted company keypair. If not provided, names won't be decrypted.
 */
export function useCompanyEmployees(
  contractAddress?: string,
  companyKeypair?: { privateKey: number[]; publicKey: number[] } | null
) {
  const { viewFunction } = useWalletSelector();

  return useQuery({
    queryKey: payrollKeys.companyEmployees(contractAddress || ""),
    queryFn: async () => {
      if (!contractAddress) throw new Error("Contract address is required");

      console.log("[useCompanyEmployees] Fetching employees for:", contractAddress);

      const employeesResult = await viewFunction({
        contractId: contractAddress,
        method: "list_employees",
        args: {
          from_index: 0,
          limit: 100, // Get first 100 employees
        },
      });

      console.log("[useCompanyEmployees] Raw employees result:", employeesResult);

      // Result is Array<[employee_id, encrypted_name, status]>
      if (Array.isArray(employeesResult)) {
        const decryptedEmployees = await Promise.all(
          employeesResult.map(async (emp: any) => {
            const employeeId = emp[0];
            const encryptedName = new Uint8Array(emp[1]);
            const status = emp[2];

            // Decrypt name locally with company's keypair (if available)
            let name = employeeId; // Fallback to ID if no keypair or decryption fails

            if (companyKeypair) {
              try {
                const privateKeyBytes = new Uint8Array(companyKeypair.privateKey);
                const publicKeyBytes = new Uint8Array(companyKeypair.publicKey);
                const decryptedBytes = await decryptWithPrivateKey(
                  encryptedName,
                  privateKeyBytes,
                  publicKeyBytes
                );
                name = new TextDecoder().decode(decryptedBytes);
              } catch (error) {
                console.warn(
                  "[useCompanyEmployees] Failed to decrypt name for:",
                  employeeId,
                  error
                );
              }
            } else {
              console.warn(
                "[useCompanyEmployees] No keypair provided - names will not be decrypted"
              );
            }

            // Fetch full employee details to get salary
            let salary = "Unknown";
            try {
              const employeeDetails: any = await viewFunction({
                contractId: contractAddress,
                method: "get_employee",
                args: { employee_id: employeeId },
              });

              if (employeeDetails && employeeDetails.encrypted_salary) {
                // Salary is stored as plaintext bytes (not encrypted)
                const salaryBytes = new Uint8Array(employeeDetails.encrypted_salary);
                salary = new TextDecoder().decode(salaryBytes);
              }
            } catch (error) {
              console.warn(
                "[useCompanyEmployees] Failed to fetch salary for:",
                employeeId,
                error
              );
            }

            return {
              id: employeeId,
              name,
              salary,
              encryptedName: emp[1],
              status,
            };
          })
        );

        return decryptedEmployees;
      }

      return [];
    },
    enabled: !!contractAddress,
  });
}

/**
 * Query company public key
 * Used for encrypting employee names that the company needs to decrypt
 */
export function useCompanyPublicKey(contractAddress?: string) {
  const { viewFunction } = useWalletSelector();

  return useQuery({
    queryKey: payrollKeys.companyPublicKey(contractAddress || ""),
    queryFn: async () => {
      if (!contractAddress) throw new Error("Contract address is required");

      console.log("[useCompanyPublicKey] Fetching public key for:", contractAddress);

      const publicKeyResult = await viewFunction({
        contractId: contractAddress,
        method: "get_company_public_key",
        args: {},
      });

      console.log("[useCompanyPublicKey] Public key result:", publicKeyResult);

      return new Uint8Array(publicKeyResult as number[]);
    },
    enabled: !!contractAddress,
  });
}

// ============================================================================
// Employee Queries
// ============================================================================

/**
 * Query employee data
 */
export function useEmployeeData(contractId?: string, employeeId?: string) {
  const { viewFunction } = useWalletSelector();

  return useQuery({
    queryKey: payrollKeys.employeeData(contractId || "", employeeId || ""),
    queryFn: async () => {
      if (!contractId || !employeeId)
        throw new Error("Contract ID and employee ID are required");

      console.log("[useEmployeeData] Fetching employee data for:", employeeId);
      console.log("[useEmployeeData] Company contract:", contractId);

      const employeeResult = await viewFunction({
        contractId,
        method: "get_employee",
        args: { employee_id: employeeId },
      });

      console.log("[useEmployeeData] Employee data:", employeeResult);

      return employeeResult;
    },
    enabled: !!contractId && !!employeeId,
  });
}

/**
 * Query employee balance
 */
export function useEmployeeBalance(contractId?: string, employeeId?: string) {
  const { viewFunction } = useWalletSelector();

  return useQuery({
    queryKey: payrollKeys.employeeBalance(contractId || "", employeeId || ""),
    queryFn: async () => {
      if (!contractId || !employeeId)
        throw new Error("Contract ID and employee ID are required");

      console.log("[useEmployeeBalance] Fetching balance for:", employeeId);

      const balanceResult = await viewFunction({
        contractId,
        method: "get_balance",
        args: { employee_id: employeeId },
      });

      console.log("[useEmployeeBalance] Raw balance result:", balanceResult);

      const balance = formatBalance(balanceResult as string | number);
      console.log("[useEmployeeBalance] Available Balance:", balance, "wZEC");

      return balance;
    },
    enabled: !!contractId && !!employeeId,
  });
}

/**
 * Query employee payment count
 */
export function useEmployeePaymentCount(
  contractId?: string,
  employeeId?: string,
) {
  const { viewFunction } = useWalletSelector();

  return useQuery({
    queryKey: payrollKeys.employeePaymentCount(
      contractId || "",
      employeeId || "",
    ),
    queryFn: async () => {
      if (!contractId || !employeeId)
        throw new Error("Contract ID and employee ID are required");

      console.log(
        "[useEmployeePaymentCount] Fetching payment count for:",
        employeeId,
      );

      const paymentCountResult = await viewFunction({
        contractId,
        method: "get_payment_count",
        args: { employee_id: employeeId },
      });

      console.log(
        "[useEmployeePaymentCount] Payment count:",
        paymentCountResult,
      );

      const count =
        typeof paymentCountResult === "number"
          ? paymentCountResult
          : Number(paymentCountResult || 0);
      return count;
    },
    enabled: !!contractId && !!employeeId,
  });
}

// ============================================================================
// Mutations
// ============================================================================

interface AddEmployeeParams {
  contractId: string;
  employeeId: string;
  encrypted_name: number[];
  encrypted_salary: number[];
  salary_commitment: number[];
  employee_public_key: number[];
}

/**
 * Mutation to add employee to payroll
 */
export function useAddEmployee() {
  const { callFunction } = useWalletSelector();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AddEmployeeParams) => {
      console.log("[useAddEmployee] Adding employee:", params.employeeId);

      await callFunction({
        contractId: params.contractId,
        method: "add_employee",
        args: {
          employee_id: params.employeeId,
          encrypted_name: params.encrypted_name,
          encrypted_salary: params.encrypted_salary,
          salary_commitment: params.salary_commitment,
          employee_public_key: params.employee_public_key,
        },
        gas: "50000000000000", // 50 TGas
        deposit: "0",
      });

      console.log("[useAddEmployee] Employee added successfully");
      return params.employeeId;
    },
    onSuccess: (_, variables) => {
      // Invalidate company stats to refetch employee count
      queryClient.invalidateQueries({
        queryKey: payrollKeys.companyStats(variables.contractId),
      });

      // Invalidate employees list
      queryClient.invalidateQueries({
        queryKey: payrollKeys.companyEmployees(variables.contractId),
      });

      // Invalidate employee data
      queryClient.invalidateQueries({
        queryKey: payrollKeys.employeeData(
          variables.contractId,
          variables.employeeId,
        ),
      });
    },
  });
}

interface FundAccountParams {
  amount: string;
  companyId: string;
}

/**
 * Mutation to fund company account via bridge
 */
export function useFundAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: FundAccountParams) => {
      console.log("[useFundAccount] Funding account:", params.companyId);

      const zecAmount = parseFloat(params.amount).toFixed(8);

      const response = await fetch("/api/bridge/simulate-deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: zecAmount,
          companyId: params.companyId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fund account");
      }

      const result = await response.json();
      console.log("[useFundAccount] Fund successful, txid:", result.txid);

      return result;
    },
    onSuccess: (_, variables) => {
      // Wait a bit for bridge-relayer to process, then invalidate balance
      setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: payrollKeys.companyBalance(variables.companyId),
        });
      }, 5000); // 5 seconds delay
    },
  });
}

interface PayEmployeeParams {
  contractId: string;
  employeeId: string;
  paymentAmount: string;
  period: string;
}

/**
 * Mutation to process employee payment
 *
 * NOTE: This currently uses placeholder ZK proofs for development.
 * Production implementation requires RISC Zero proof generation.
 */
export function usePayEmployee() {
  const { callFunction } = useWalletSelector();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: PayEmployeeParams) => {
      console.log(
        "[usePayEmployee] Processing payment:",
        params.employeeId,
        params.paymentAmount,
        "wZEC",
      );

      // Generate payment commitment
      const amountValue = BigInt(
        Math.round(parseFloat(params.paymentAmount) * 100_000_000),
      ); // Convert to smallest unit
      const blinding = generateBlinding();
      const commitment = generateSalaryCommitment(amountValue, blinding);

      // Encrypt payment amount
      const amountBytes = new TextEncoder().encode(params.paymentAmount);
      const publicKey = generateBlinding(); // Placeholder: use employee's public key
      const encryptedAmountBytes = await encryptWithPublicKey(amountBytes, publicKey);
      const encrypted_amount = Array.from(encryptedAmountBytes);

      // TODO: Generate real ZK proof via proof server
      // For now, use placeholder proof (will fail verification if contract checks are enabled)
      const placeholder_proof = new Array(260).fill(0); // Placeholder Groth16 proof structure

      console.log("[usePayEmployee] Payment commitment generated");
      console.log(
        "[usePayEmployee] NOTE: Using placeholder ZK proof - integrate proof server for production",
      );

      await callFunction({
        contractId: params.contractId,
        method: "pay_employee",
        args: {
          employee_id: params.employeeId,
          encrypted_amount,
          payment_commitment: Array.from(commitment.value),
          period: params.period,
          zk_proof: placeholder_proof,
        },
        gas: "100000000000000", // 100 TGas (complex operation with proof verification)
        deposit: "0",
      });

      console.log("[usePayEmployee] Payment processed successfully");
      return params.employeeId;
    },
    onSuccess: (_, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({
        queryKey: payrollKeys.companyBalance(variables.contractId),
      });
      queryClient.invalidateQueries({
        queryKey: payrollKeys.companyStats(variables.contractId),
      });
      queryClient.invalidateQueries({
        queryKey: payrollKeys.employeeBalance(
          variables.contractId,
          variables.employeeId,
        ),
      });
      queryClient.invalidateQueries({
        queryKey: payrollKeys.employeePaymentCount(
          variables.contractId,
          variables.employeeId,
        ),
      });
    },
  });
}

// ============================================================================
// Composite Hooks (Centralized Dashboard Queries)
// ============================================================================

/**
 * Centralized hook for company dashboard
 * Returns all queries needed for the company view
 */
export function useCompanyDashboard() {
  // Load company data from localStorage
  const [companyData, setCompanyData] = useState<any>(null);

  useEffect(() => {
    const data = localStorage.getItem("company_data");
    if (data) {
      setCompanyData(JSON.parse(data));
    }
  }, []);

  const contractAddress = companyData?.contractAddress;

  // Fetch all company data with TanStack Query
  const balanceQuery = useCompanyBalance(contractAddress);
  const statsQuery = useCompanyStats(contractAddress);

  return {
    // Company info
    companyData,
    contractAddress,

    // Balance
    balance: balanceQuery.data || "0.00",
    isLoadingBalance: balanceQuery.isLoading,
    balanceError: balanceQuery.error,

    // Stats
    employeeCount: statsQuery.data?.totalEmployees || 0,
    totalPayments: statsQuery.data?.totalPayments || 0,
    isLoadingStats: statsQuery.isLoading,
    statsError: statsQuery.error,

    // Overall loading state
    isLoading: balanceQuery.isLoading || statsQuery.isLoading,
  };
}

/**
 * Centralized hook for employee dashboard
 * Returns all queries needed for the employee view
 */
export function useEmployeeDashboard() {
  const { signedAccountId } = useWalletSelector();

  // Load company contract ID from localStorage
  const [companyContractId, setCompanyContractId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const stored = localStorage.getItem("employee_company_contract");
    if (stored) {
      setCompanyContractId(stored);
    }
  }, []);

  // Fetch all employee data with TanStack Query
  const employeeDataQuery = useEmployeeData(
    companyContractId || undefined,
    signedAccountId || undefined,
  );
  const balanceQuery = useEmployeeBalance(
    companyContractId || undefined,
    signedAccountId || undefined,
  );
  const paymentCountQuery = useEmployeePaymentCount(
    companyContractId || undefined,
    signedAccountId || undefined,
  );

  return {
    // Employee info
    signedAccountId,
    companyContractId,
    employeeData: employeeDataQuery.data,

    // Balance
    availableBalance: balanceQuery.data || "0.00",
    lentBalance: "0.00", // TODO: Implement DeFi integration

    // Payment count
    paymentCount: paymentCountQuery.data || 0,

    // Loading states
    isLoadingData: employeeDataQuery.isLoading,
    isLoadingStats: balanceQuery.isLoading || paymentCountQuery.isLoading,
    isLoading:
      employeeDataQuery.isLoading ||
      balanceQuery.isLoading ||
      paymentCountQuery.isLoading,

    // Errors
    dataError: employeeDataQuery.error,
    balanceError: balanceQuery.error,
    paymentCountError: paymentCountQuery.error,
  };
}
