'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWalletSelector } from '@near-wallet-selector/react-hook';

interface QuickStartProgress {
  funded: boolean;
  fundedAmount?: number;
  employeeAdded: boolean;
  employeeName?: string;
  recurringSetup: boolean;
}

export default function CompanyQuickStartPage() {
  const router = useRouter();
  const { signedAccountId } = useWalletSelector();

  const [activeStep, setActiveStep] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Fund Account
  const [fundAmount, setFundAmount] = useState('10000');
  const [token, setToken] = useState('wZEC');

  // Step 2: Add Employee
  const [employeeName, setEmployeeName] = useState('');
  const [employeeWallet, setEmployeeWallet] = useState('');
  const [baseSalary, setBaseSalary] = useState('');
  const [employeeRole, setEmployeeRole] = useState('');

  // Step 3: Recurring Payment
  const [recurringFrequency, setRecurringFrequency] = useState('Monthly');
  const [startDate, setStartDate] = useState('');

  // Progress tracking
  const [progress, setProgress] = useState<QuickStartProgress>({
    funded: false,
    employeeAdded: false,
    recurringSetup: false,
  });

  const steps = ['Fund Account', 'Add First Employee', 'Setup Recurring Payment'];

  const handleFundAccount = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      console.log('[QuickStart] Funding account:', fundAmount, token);

      // TODO: Deposit company funds to payroll contract
      await new Promise(resolve => setTimeout(resolve, 2000));

      setProgress({ ...progress, funded: true, fundedAmount: parseFloat(fundAmount) });
      setActiveStep(1);
    } catch (err) {
      console.error('[QuickStart] Error funding account:', err);
      setError(err instanceof Error ? err.message : 'Failed to fund account');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAddEmployee = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      if (!employeeWallet.trim() || !employeeName.trim()) {
        throw new Error('Employee name and wallet address are required');
      }

      console.log('[QuickStart] Adding employee:', employeeName);

      // TODO: Add employee to payroll contract
      await new Promise(resolve => setTimeout(resolve, 2000));

      setProgress({ ...progress, employeeAdded: true, employeeName });
      setActiveStep(2);
    } catch (err) {
      console.error('[QuickStart] Error adding employee:', err);
      setError(err instanceof Error ? err.message : 'Failed to add employee');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSetupRecurring = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      if (!baseSalary || parseFloat(baseSalary) <= 0) {
        throw new Error('Base salary is required');
      }

      console.log('[QuickStart] Setting up recurring payment');

      // TODO: Create recurring payment
      await new Promise(resolve => setTimeout(resolve, 2000));

      setProgress({ ...progress, recurringSetup: true });

      // Complete wizard, navigate to dashboard
      localStorage.setItem('quickstart_completed', 'true');
      router.push('/dashboard/company');
    } catch (err) {
      console.error('[QuickStart] Error setting up recurring payment:', err);
      setError(err instanceof Error ? err.message : 'Failed to setup recurring payment');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="w-full max-w-3xl mx-auto">
        <Card className="border-border/50">
          <CardHeader className="text-center space-y-2">
            <CardTitle className="text-3xl font-bold">Quick Start</CardTitle>
            <CardDescription className="text-base">
              Get your payroll system up and running in 3 optional steps
            </CardDescription>
            <Button
              variant="link"
              size="sm"
              onClick={() => router.push('/dashboard/company')}
              className="text-muted-foreground"
            >
              Skip Wizard →
            </Button>
          </CardHeader>

          <CardContent className="space-y-8">
            {/* Stepper */}
            <div className="flex items-center justify-between">
              {steps.map((step, index) => (
                <div key={step} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center flex-1">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                      index < activeStep || (index === 0 && progress.funded) || (index === 1 && progress.employeeAdded) || (index === 2 && progress.recurringSetup)
                        ? 'bg-primary border-primary text-white'
                        : index === activeStep
                        ? 'border-primary text-primary'
                        : 'border-border text-muted-foreground'
                    }`}>
                      {(index === 0 && progress.funded) || (index === 1 && progress.employeeAdded) || (index === 2 && progress.recurringSetup) ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : (
                        <span className="font-semibold">{index + 1}</span>
                      )}
                    </div>
                    <p className="text-xs mt-2 text-center">{step}</p>
                  </div>
                  {index < steps.length - 1 && (
                    <div className={`h-0.5 flex-1 mx-2 ${
                      index < activeStep ? 'bg-primary' : 'bg-border'
                    }`} />
                  )}
                </div>
              ))}
            </div>

            {/* Error Alert */}
            {error && (
              <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/10 text-red-500 text-sm">
                {error}
              </div>
            )}

            {/* Step Content */}
            {activeStep === 0 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Step 1: Fund Your Payroll Account</h3>
                  <p className="text-sm text-muted-foreground">
                    Deposit funds to pay your employees. You can always add more later.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Amount</label>
                    <input
                      type="number"
                      value={fundAmount}
                      onChange={(e) => setFundAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                      disabled={isProcessing}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Token</label>
                    <select
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                      disabled={isProcessing}
                    >
                      <option value="wZEC">wZEC</option>
                      <option value="NEAR">NEAR</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setActiveStep(1)}
                    disabled={isProcessing}
                  >
                    Skip for Now
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleFundAccount}
                    disabled={isProcessing}
                  >
                    {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {isProcessing ? 'Processing...' : 'Deposit Now'}
                  </Button>
                </div>
              </div>
            )}

            {activeStep === 1 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Step 2: Add Your First Employee</h3>
                  <p className="text-sm text-muted-foreground">
                    Add an employee to your payroll system.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Employee Name</label>
                  <input
                    type="text"
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                    disabled={isProcessing}
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
                    disabled={isProcessing}
                  />
                  <p className="text-xs text-muted-foreground mt-1">The employee's NEAR account</p>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Base Salary</label>
                    <input
                      type="number"
                      value={baseSalary}
                      onChange={(e) => setBaseSalary(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                      disabled={isProcessing}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Role (Optional)</label>
                    <input
                      type="text"
                      value={employeeRole}
                      onChange={(e) => setEmployeeRole(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                      disabled={isProcessing}
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setActiveStep(2)}
                    disabled={isProcessing}
                  >
                    Skip for Now
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleAddEmployee}
                    disabled={isProcessing || !employeeName || !employeeWallet}
                  >
                    {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {isProcessing ? 'Adding...' : 'Add Employee'}
                  </Button>
                </div>
              </div>
            )}

            {activeStep === 2 && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Step 3: Setup Recurring Payment</h3>
                  <p className="text-sm text-muted-foreground">
                    {progress.employeeAdded
                      ? `Setup automatic payments for ${progress.employeeName}`
                      : 'Setup automatic recurring payments'}
                  </p>
                </div>

                {progress.employeeAdded ? (
                  <>
                    <div className="p-4 rounded-lg border border-primary/20 bg-primary/5">
                      <p className="text-sm">
                        <span className="font-semibold">Employee:</span> {progress.employeeName}
                        <br />
                        <span className="font-semibold">Base Salary:</span> ${baseSalary}
                      </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Frequency</label>
                        <select
                          value={recurringFrequency}
                          onChange={(e) => setRecurringFrequency(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                          disabled={isProcessing}
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
                          disabled={isProcessing}
                        />
                      </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => router.push('/dashboard/company')}
                        disabled={isProcessing}
                      >
                        Skip for Now
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={handleSetupRecurring}
                        disabled={isProcessing || !startDate}
                      >
                        {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {isProcessing ? 'Setting up...' : 'Setup Recurring'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="p-4 rounded-lg border border-yellow-500/20 bg-yellow-500/10">
                    <p className="text-sm text-yellow-500">
                      You need to add an employee first to setup recurring payments.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push('/dashboard/company')}
                      className="mt-3"
                    >
                      Go to Dashboard →
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Progress Summary */}
            {(progress.funded || progress.employeeAdded || progress.recurringSetup) && (
              <div className="p-4 rounded-lg border border-border bg-muted/30">
                <p className="font-semibold text-sm mb-3">Progress Summary</p>
                <div className="space-y-2">
                  {progress.funded && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span>Funded: ${progress.fundedAmount?.toLocaleString()}</span>
                    </div>
                  )}
                  {progress.employeeAdded && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span>Employee: {progress.employeeName} added</span>
                    </div>
                  )}
                  {progress.recurringSetup && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span>Recurring: {recurringFrequency} payment setup</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
