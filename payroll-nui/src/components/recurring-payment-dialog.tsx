'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Calendar, X } from 'lucide-react';

interface RecurringPaymentDialogProps {
  companyId: string;
  employeeId?: string;
  employeeName?: string;
  baseSalary?: string;
  onSuccess?: (config: { frequency: string; startDate: string }) => void;
  onClose?: () => void;
}

export function RecurringPaymentDialog({
  companyId,
  employeeId,
  employeeName,
  baseSalary,
  onSuccess,
  onClose,
}: RecurringPaymentDialogProps) {
  const [recurringFrequency, setRecurringFrequency] = useState('Monthly');
  const [startDate, setStartDate] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSetupRecurring = async () => {
    setIsProcessing(true);
    setError(null);
    setSuccess(false);

    try {
      if (!startDate) {
        throw new Error('Start date is required');
      }

      console.log('[RecurringPayment] Setting up recurring payment');
      console.log('  Frequency:', recurringFrequency);
      console.log('  Start Date:', startDate);
      console.log('  Employee:', employeeName || '(all employees)');

      // TODO: Implement contract call when recurring payment feature is ready
      // For now, store configuration locally
      const config = {
        frequency: recurringFrequency,
        startDate,
        employeeId,
        employeeName,
        baseSalary,
        companyId,
        createdAt: new Date().toISOString(),
      };

      // Save to localStorage for now
      const key = `recurring_payment_${companyId}${employeeId ? `_${employeeId}` : ''}`;
      localStorage.setItem(key, JSON.stringify(config));

      // Simulate async operation
      await new Promise(resolve => setTimeout(resolve, 1500));

      console.log('[RecurringPayment] Recurring payment configured');

      setSuccess(true);

      if (onSuccess) {
        onSuccess({ frequency: recurringFrequency, startDate });
      }

      // Reset form after delay
      setTimeout(() => {
        setRecurringFrequency('Monthly');
        setStartDate('');
        setSuccess(false);
      }, 2000);
    } catch (err) {
      console.error('[RecurringPayment] Error setting up recurring payment:', err);
      setError(err instanceof Error ? err.message : 'Failed to setup recurring payment');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Setup Recurring Payment</CardTitle>
            <CardDescription>
              {employeeName
                ? `Configure automatic payments for ${employeeName}`
                : 'Configure automatic recurring payments'}
            </CardDescription>
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isProcessing}
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
              📅 <span className="font-semibold">Automatic Payments</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Set up automatic recurring payments. You'll be notified when payments are due.
            </p>
          </div>

          {/* Employee Info (if specific employee) */}
          {employeeName && baseSalary && (
            <div className="p-4 rounded-lg border border-primary/20 bg-primary/5">
              <p className="text-sm">
                <span className="font-semibold">Employee:</span> {employeeName}
                <br />
                <span className="font-semibold">Base Salary:</span> {baseSalary} wZEC
              </p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="p-4 rounded-lg border border-green-500/20 bg-green-500/10 text-green-500 text-sm">
              <p className="font-semibold mb-1">✅ Recurring Payment Configured!</p>
              <p className="text-xs">
                {recurringFrequency} payments will start on {startDate}
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/10 text-red-500 text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Frequency</label>
              <select
                value={recurringFrequency}
                onChange={(e) => setRecurringFrequency(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                disabled={isProcessing || success}
              >
                <option value="Weekly">Weekly</option>
                <option value="Bi-weekly">Bi-weekly</option>
                <option value="Monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                disabled={isProcessing || success}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </div>

          {/* Note */}
          <div className="p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Note:</span> Recurring payments are configured locally.
              You'll receive notifications when payments are due and can process them from the dashboard.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            {onClose && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={onClose}
                disabled={isProcessing}
              >
                Cancel
              </Button>
            )}
            <Button
              className="flex-1"
              onClick={handleSetupRecurring}
              disabled={isProcessing || success || !startDate}
            >
              {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isProcessing ? 'Setting up...' : success ? 'Configured!' : 'Setup Recurring'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
