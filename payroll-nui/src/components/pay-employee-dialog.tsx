'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Send, X, AlertCircle, Users } from 'lucide-react';
import { usePayEmployee, useCompanyEmployees } from '@/lib/hooks/use-payroll-queries';

interface PayEmployeeDialogProps {
  companyId: string;
  employeeId?: string;
  employeeName?: string;
  suggestedAmount?: string;
  onSuccess?: (payment: { employeeId: string; amount: string; period: string }) => void;
  onClose?: () => void;
}

export function PayEmployeeDialog({
  companyId,
  employeeId: initialEmployeeId,
  employeeName,
  suggestedAmount,
  onSuccess,
  onClose,
}: PayEmployeeDialogProps) {
  const payEmployeeMutation = usePayEmployee();

  // Load company keypair from localStorage (unencrypted)
  const [keypair, setKeypair] = useState<{ privateKey: number[]; publicKey: number[] } | null>(null);

  useEffect(() => {
    const keypairData = localStorage.getItem('company_keypair');
    if (keypairData) {
      try {
        setKeypair(JSON.parse(keypairData));
      } catch (err) {
        console.error('[PayEmployee] Failed to load keypair:', err);
      }
    }
  }, []);

  // Fetch employees with decrypted names
  const { data: employees, isLoading: isLoadingEmployees } = useCompanyEmployees(
    companyId,
    keypair
  );

  const [employeeId, setEmployeeId] = useState(initialEmployeeId || '');
  const [paymentAmount, setPaymentAmount] = useState(suggestedAmount || '');
  const [period, setPeriod] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Get selected employee details
  const selectedEmployee = employees?.find(emp => emp.id === employeeId);

  const handlePayEmployee = async () => {
    setError(null);
    setSuccess(false);

    try {
      if (!employeeId.trim()) {
        throw new Error('Employee ID is required');
      }

      if (!paymentAmount.trim() || parseFloat(paymentAmount) <= 0) {
        throw new Error('Valid payment amount is required');
      }

      if (!period.trim()) {
        throw new Error('Payment period is required (e.g., "2025-12" or "December 2025")');
      }

      console.log('[PayEmployee] Processing payment to:', employeeId);

      // Use TanStack Query mutation
      await payEmployeeMutation.mutateAsync({
        contractId: companyId,
        employeeId: employeeId.trim(),
        paymentAmount: paymentAmount.trim(),
        period: period.trim(),
      });

      console.log('[PayEmployee] Payment processed successfully');

      setSuccess(true);

      if (onSuccess) {
        onSuccess({
          employeeId: employeeId.trim(),
          amount: paymentAmount.trim(),
          period: period.trim(),
        });
      }

      // Reset form after delay
      setTimeout(() => {
        setEmployeeId(initialEmployeeId || '');
        setPaymentAmount(suggestedAmount || '');
        setPeriod('');
        setSuccess(false);
      }, 2000);
    } catch (err) {
      console.error('[PayEmployee] Error processing payment:', err);
      setError(err instanceof Error ? err.message : 'Failed to process payment');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Process Payment</CardTitle>
            <CardDescription>
              Pay an employee with zero-knowledge privacy
            </CardDescription>
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={payEmployeeMutation.isPending}
              className="h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Info Box */}
          <div className="p-4 border border-border rounded-lg bg-muted/50 space-y-2">
            <h4 className="font-medium text-sm">Privacy Note</h4>
            <p className="text-xs text-muted-foreground">
              Payment amounts are encrypted on-chain. Only the employee can decrypt their payment.
            </p>
            {/* ZK Proof Warning */}
            <div className="flex items-start gap-2 mt-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded">
              <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-medium text-yellow-600 dark:text-yellow-400">Development Mode</p>
                <p className="text-muted-foreground mt-1">
                  Currently using placeholder ZK proofs. Integrate proof server for production.
                </p>
              </div>
            </div>
          </div>

          {/* Success Message */}
          {success && (
            <div className="p-4 border border-green-500/50 bg-green-500/10 rounded-lg">
              <p className="text-sm font-medium text-green-600 dark:text-green-400">
                Payment processed successfully!
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                The employee will see the updated balance.
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 border border-red-500/50 bg-red-500/10 rounded-lg">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Error</p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
            </div>
          )}

          {/* Employee Info (if pre-selected) */}
          {employeeName && initialEmployeeId && (
            <div className="p-3 border border-border rounded-lg bg-muted/30">
              <p className="text-sm font-medium">{employeeName}</p>
              <p className="text-xs text-muted-foreground font-mono mt-1">{initialEmployeeId}</p>
            </div>
          )}

          {/* Form Fields */}
          <div className="space-y-4">
            {!initialEmployeeId && (
              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Select Employee
                </label>
                {isLoadingEmployees ? (
                  <div className="flex items-center gap-2 p-3 border border-border rounded-lg bg-muted/30">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Loading employees...</span>
                  </div>
                ) : employees && employees.length > 0 ? (
                  <select
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                    disabled={payEmployeeMutation.isPending || success}
                  >
                    <option value="">-- Select an employee --</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} - {emp.id.split('.')[0]} {emp.status === 'Active' ? '✓' : '(Inactive)'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 border border-border rounded-lg bg-muted/30">
                    <p className="text-sm text-muted-foreground">
                      No employees found. Add employees first.
                    </p>
                  </div>
                )}
                {selectedEmployee && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Status: <span className="font-medium">{selectedEmployee.status}</span>
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2">Payment Amount (wZEC)</label>
              <input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                disabled={payEmployeeMutation.isPending || success}
                step="0.001"
                min="0"
                placeholder="0.05"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Amount will be encrypted on-chain
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Payment Period</label>
              <input
                type="text"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                disabled={payEmployeeMutation.isPending || success}
                placeholder="2025-12 or December 2025"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Identifier for this payment (e.g., month/year)
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            {onClose && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={onClose}
                disabled={payEmployeeMutation.isPending}
              >
                Cancel
              </Button>
            )}
            <Button
              className="flex-1"
              onClick={handlePayEmployee}
              disabled={payEmployeeMutation.isPending || success || !employeeId || !paymentAmount || !period}
            >
              {payEmployeeMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Send className="w-4 h-4 mr-2" />
              {payEmployeeMutation.isPending ? 'Processing...' : success ? 'Paid!' : 'Process Payment'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
