'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, UserPlus, X, CheckCircle } from 'lucide-react';
import { generateBlinding, generateSalaryCommitment, encryptWithPublicKey } from '@near-private-payroll/sdk';
import { useAddEmployee, useCompanyPublicKey } from '@/lib/hooks/use-payroll-queries';

interface AddEmployeeDialogProps {
  companyId: string;
  onSuccess?: (employee: { id: string; name: string; salary: string }) => void;
  onClose?: () => void;
}

export function AddEmployeeDialog({ companyId, onSuccess, onClose }: AddEmployeeDialogProps) {
  const addEmployeeMutation = useAddEmployee();
  const { data: companyPublicKey, isLoading: isLoadingPublicKey } = useCompanyPublicKey(companyId);

  const [employeeName, setEmployeeName] = useState('');
  const [employeeWallet, setEmployeeWallet] = useState('');
  const [baseSalary, setBaseSalary] = useState('');
  const [employeeRole, setEmployeeRole] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleReset = () => {
    setEmployeeName('');
    setEmployeeWallet('');
    setBaseSalary('');
    setEmployeeRole('');
    setSuccess(false);
    setError(null);
  };

  const handleAddEmployee = async () => {
    setError(null);
    setSuccess(false);

    try {
      if (!employeeWallet.trim() || !employeeName.trim()) {
        throw new Error('Employee name and wallet address are required');
      }

      if (!baseSalary.trim() || parseFloat(baseSalary) <= 0) {
        throw new Error('Valid base salary is required');
      }

      if (!companyPublicKey) {
        throw new Error('Company public key not loaded yet');
      }

      console.log('[AddEmployee] Adding employee:', employeeName);

      // Encrypt name with COMPANY's public key (so company can decrypt for UI)
      const nameBytes = new TextEncoder().encode(employeeName.trim());
      const encryptedNameBytes = await encryptWithPublicKey(nameBytes, companyPublicKey);
      const encrypted_name = Array.from(encryptedNameBytes);

      // Store salary as plaintext bytes (company knows salary, commitment provides on-chain privacy)
      const salaryBytes = new TextEncoder().encode(baseSalary.trim());
      const encrypted_salary = Array.from(salaryBytes);

      // Generate salary commitment for on-chain privacy
      const salaryValue = BigInt(baseSalary.trim());
      const blinding = generateBlinding();
      const commitment = generateSalaryCommitment(salaryValue, blinding);
      const salary_commitment = Array.from(commitment.value);

      console.log('[AddEmployee] Name encrypted, salary commitment generated');
      console.log('[AddEmployee] Calling contract...');

      // Add employee using TanStack Query mutation
      await addEmployeeMutation.mutateAsync({
        contractId: companyId,
        employeeId: employeeWallet.trim(),
        encrypted_name,
        encrypted_salary,
        salary_commitment,
        employee_public_key: [], // No longer needed
      });

      console.log('[AddEmployee] Employee added successfully');

      setSuccess(true);

      if (onSuccess) {
        onSuccess({
          id: employeeWallet.trim(),
          name: employeeName.trim(),
          salary: baseSalary.trim(),
        });
      }

      // Reset form after success
      setTimeout(() => {
        handleReset();
      }, 2000);
    } catch (err) {
      console.error('[AddEmployee] Error adding employee:', err);
      setError(err instanceof Error ? err.message : 'Failed to add employee');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Add Employee</CardTitle>
            <CardDescription>
              Add a new employee to your private payroll
            </CardDescription>
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={addEmployeeMutation.isPending}
              className="h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Info Box */}
          <div className="p-4 rounded-lg border border-blue-500/20 bg-blue-500/5">
            <p className="text-sm mb-2">
              🔒 <span className="font-semibold">Privacy-Preserving Payroll</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Employee data is encrypted and salaries are stored as cryptographic commitments to ensure privacy.
            </p>
          </div>

          {/* Success Message */}
          {success && (
            <div className="p-4 rounded-lg border border-green-500/20 bg-green-500/10 text-green-500 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-1">Employee Added Successfully!</p>
                  <p className="text-xs">
                    {employeeName} has been added to your payroll. Share the company contract address ({companyId}) and their salary with them so they can access their payroll data.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/10 text-red-500 text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          {!success && (
          <>
            <div>
              <label className="block text-sm font-medium mb-2">Employee Name</label>
              <input
                type="text"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                disabled={addEmployeeMutation.isPending || success}
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Wallet Address</label>
              <input
                type="text"
                value={employeeWallet}
                onChange={(e) => setEmployeeWallet(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background font-mono text-sm"
                placeholder="employee.near"
                disabled={addEmployeeMutation.isPending || success}
              />
              <p className="text-xs text-muted-foreground mt-1">The employee's NEAR account</p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Base Salary (wZEC)</label>
                <input
                  type="number"
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                  disabled={addEmployeeMutation.isPending || success}
                  step="0.001"
                  min="0"
                  placeholder="0.05"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Role (Optional)</label>
                <input
                  type="text"
                  value={employeeRole}
                  onChange={(e) => setEmployeeRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                  disabled={addEmployeeMutation.isPending || success}
                  placeholder="Developer"
                />
              </div>
            </div>
          </>
          )}

          {/* Actions */}
          {!success && (
          <div className="flex gap-3 pt-4">
            {onClose && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={onClose}
                disabled={addEmployeeMutation.isPending}
              >
                Cancel
              </Button>
            )}
            <Button
              className="flex-1"
              onClick={handleAddEmployee}
              disabled={addEmployeeMutation.isPending || success || !employeeName || !employeeWallet || !baseSalary || isLoadingPublicKey}
            >
              {(addEmployeeMutation.isPending || isLoadingPublicKey) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {addEmployeeMutation.isPending ? 'Adding...' : isLoadingPublicKey ? 'Loading...' : 'Add Employee'}
            </Button>
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
