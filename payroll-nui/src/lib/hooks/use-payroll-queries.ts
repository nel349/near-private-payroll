/**
 * TanStack Query hooks for payroll contract view calls
 *
 * Provides modular, elegant query management with automatic caching and invalidation
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWalletSelector } from '@near-wallet-selector/react-hook';
import { CONFIG } from '@/config/contracts';
import { useState, useEffect } from 'react';

// ============================================================================
// Query Keys
// ============================================================================

export const payrollKeys = {
  all: ['payroll'] as const,
  company: (contractId: string) => [...payrollKeys.all, 'company', contractId] as const,
  companyBalance: (contractId: string) => [...payrollKeys.company(contractId), 'balance'] as const,
  companyStats: (contractId: string) => [...payrollKeys.company(contractId), 'stats'] as const,
  employee: (contractId: string, employeeId: string) => [...payrollKeys.all, 'employee', contractId, employeeId] as const,
  employeeData: (contractId: string, employeeId: string) => [...payrollKeys.employee(contractId, employeeId), 'data'] as const,
  employeeBalance: (contractId: string, employeeId: string) => [...payrollKeys.employee(contractId, employeeId), 'balance'] as const,
  employeePaymentCount: (contractId: string, employeeId: string) => [...payrollKeys.employee(contractId, employeeId), 'payment-count'] as const,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert balance from smallest unit (8 decimals) to display format
 */
function formatBalance(balance: string | number): string {
  const balanceStr = typeof balance === 'string' ? balance : String(balance || '0');
  const balanceNum = parseInt(balanceStr) / 100_000_000;
  return balanceNum.toFixed(8).replace(/\.?0+$/, '');
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
    queryKey: payrollKeys.companyBalance(contractAddress || ''),
    queryFn: async () => {
      if (!contractAddress) throw new Error('Contract address is required');

      console.log('[useCompanyBalance] Fetching balance for:', contractAddress);
      console.log('[useCompanyBalance] wZEC token contract:', CONFIG.wzecToken);

      const balanceResult = await viewFunction({
        contractId: CONFIG.wzecToken,
        method: 'ft_balance_of',
        args: { account_id: contractAddress },
      });

      console.log('[useCompanyBalance] Raw balance result:', balanceResult);

      const balance = formatBalance(balanceResult as string | number);
      console.log('[useCompanyBalance] wZEC Balance:', balance, 'wZEC');

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
    queryKey: payrollKeys.companyStats(contractAddress || ''),
    queryFn: async () => {
      if (!contractAddress) throw new Error('Contract address is required');

      console.log('[useCompanyStats] Fetching stats for:', contractAddress);

      const statsResult = await viewFunction({
        contractId: contractAddress,
        method: 'get_stats',
        args: {},
      });

      console.log('[useCompanyStats] Raw stats result:', statsResult);

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

// ============================================================================
// Employee Queries
// ============================================================================

/**
 * Query employee data
 */
export function useEmployeeData(contractId?: string, employeeId?: string) {
  const { viewFunction } = useWalletSelector();

  return useQuery({
    queryKey: payrollKeys.employeeData(contractId || '', employeeId || ''),
    queryFn: async () => {
      if (!contractId || !employeeId) throw new Error('Contract ID and employee ID are required');

      console.log('[useEmployeeData] Fetching employee data for:', employeeId);
      console.log('[useEmployeeData] Company contract:', contractId);

      const employeeResult = await viewFunction({
        contractId,
        method: 'get_employee',
        args: { employee_id: employeeId },
      });

      console.log('[useEmployeeData] Employee data:', employeeResult);

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
    queryKey: payrollKeys.employeeBalance(contractId || '', employeeId || ''),
    queryFn: async () => {
      if (!contractId || !employeeId) throw new Error('Contract ID and employee ID are required');

      console.log('[useEmployeeBalance] Fetching balance for:', employeeId);

      const balanceResult = await viewFunction({
        contractId,
        method: 'get_balance',
        args: { employee_id: employeeId },
      });

      console.log('[useEmployeeBalance] Raw balance result:', balanceResult);

      const balance = formatBalance(balanceResult as string | number);
      console.log('[useEmployeeBalance] Available Balance:', balance, 'wZEC');

      return balance;
    },
    enabled: !!contractId && !!employeeId,
  });
}

/**
 * Query employee payment count
 */
export function useEmployeePaymentCount(contractId?: string, employeeId?: string) {
  const { viewFunction } = useWalletSelector();

  return useQuery({
    queryKey: payrollKeys.employeePaymentCount(contractId || '', employeeId || ''),
    queryFn: async () => {
      if (!contractId || !employeeId) throw new Error('Contract ID and employee ID are required');

      console.log('[useEmployeePaymentCount] Fetching payment count for:', employeeId);

      const paymentCountResult = await viewFunction({
        contractId,
        method: 'get_payment_count',
        args: { employee_id: employeeId },
      });

      console.log('[useEmployeePaymentCount] Payment count:', paymentCountResult);

      const count = typeof paymentCountResult === 'number' ? paymentCountResult : Number(paymentCountResult || 0);
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
  public_key: number[];
}

/**
 * Mutation to add employee to payroll
 */
export function useAddEmployee() {
  const { callFunction } = useWalletSelector();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AddEmployeeParams) => {
      console.log('[useAddEmployee] Adding employee:', params.employeeId);

      await callFunction({
        contractId: params.contractId,
        method: 'add_employee',
        args: {
          employee_id: params.employeeId,
          encrypted_name: params.encrypted_name,
          encrypted_salary: params.encrypted_salary,
          salary_commitment: params.salary_commitment,
          public_key: params.public_key,
        },
        gas: '50000000000000', // 50 TGas
        deposit: '0',
      });

      console.log('[useAddEmployee] Employee added successfully');
      return params.employeeId;
    },
    onSuccess: (_, variables) => {
      // Invalidate company stats to refetch employee count
      queryClient.invalidateQueries({ queryKey: payrollKeys.companyStats(variables.contractId) });

      // Invalidate employee data
      queryClient.invalidateQueries({ queryKey: payrollKeys.employeeData(variables.contractId, variables.employeeId) });
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
      console.log('[useFundAccount] Funding account:', params.companyId);

      const zecAmount = parseFloat(params.amount).toFixed(8);

      const response = await fetch('/api/bridge/simulate-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: zecAmount, companyId: params.companyId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fund account');
      }

      const result = await response.json();
      console.log('[useFundAccount] Fund successful, txid:', result.txid);

      return result;
    },
    onSuccess: (_, variables) => {
      // Wait a bit for bridge-relayer to process, then invalidate balance
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: payrollKeys.companyBalance(variables.companyId) });
      }, 5000); // 5 seconds delay
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
    const data = localStorage.getItem('company_data');
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
    balance: balanceQuery.data || '0.00',
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
  const [companyContractId, setCompanyContractId] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('employee_company_contract');
    if (stored) {
      setCompanyContractId(stored);
    }
  }, []);

  // Fetch all employee data with TanStack Query
  const employeeDataQuery = useEmployeeData(companyContractId || undefined, signedAccountId || undefined);
  const balanceQuery = useEmployeeBalance(companyContractId || undefined, signedAccountId || undefined);
  const paymentCountQuery = useEmployeePaymentCount(companyContractId || undefined, signedAccountId || undefined);

  return {
    // Employee info
    signedAccountId,
    companyContractId,
    employeeData: employeeDataQuery.data,

    // Balance
    availableBalance: balanceQuery.data || '0.00',
    lentBalance: '0.00', // TODO: Implement DeFi integration

    // Payment count
    paymentCount: paymentCountQuery.data || 0,

    // Loading states
    isLoadingData: employeeDataQuery.isLoading,
    isLoadingStats: balanceQuery.isLoading || paymentCountQuery.isLoading,
    isLoading: employeeDataQuery.isLoading || balanceQuery.isLoading || paymentCountQuery.isLoading,

    // Errors
    dataError: employeeDataQuery.error,
    balanceError: balanceQuery.error,
    paymentCountError: paymentCountQuery.error,
  };
}
