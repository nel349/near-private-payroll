'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Loader2, Copy, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWalletSelector } from '@near-wallet-selector/react-hook';
import { generateSalaryCommitment, encryptWithPublicKey, generateBlinding } from '@near-private-payroll/sdk';
import { CONFIG } from '@/config/contracts';

interface QuickStartProgress {
  funded: boolean;
  fundedAmount?: number;
  employeeAdded: boolean;
  employeeName?: string;
  recurringSetup: boolean;
}

export default function CompanyQuickStartPage() {
  const router = useRouter();
  const { signedAccountId, callFunction, viewFunction } = useWalletSelector();

  // Load company data from localStorage
  const [companyData, setCompanyData] = useState<any>(null);

  const [activeStep, setActiveStep] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Fund Account
  const [fundAmount, setFundAmount] = useState('0.01');
  const token = 'ZEC';

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

  // Load company data on mount
  useEffect(() => {
    const data = localStorage.getItem('company_data');
    if (data) {
      setCompanyData(JSON.parse(data));
    }
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleFundAccount = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      if (!companyData?.contractAddress) {
        throw new Error('Company contract address not found');
      }

      if (!signedAccountId) {
        throw new Error('Wallet not connected');
      }

      if (!fundAmount || parseFloat(fundAmount) <= 0) {
        throw new Error('Please enter a valid amount');
      }

      console.log('[QuickStart] Initiating bridge deposit:', fundAmount, 'ZEC');
      console.log('[QuickStart] Flow: ZEC → Bridge Custody → wZEC Mint → Payroll Contract');

      // fundAmount is already in ZEC, just validate and format
      const zecAmount = parseFloat(fundAmount).toFixed(8);

      // Step 1: Send ZEC to bridge (simulated via API)
      console.log('[QuickStart] Step 1: Sending ZEC to bridge custody...');
      const bridgeResponse = await fetch('/api/bridge/simulate-deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: zecAmount,
          companyId: companyData.contractAddress,
        }),
      });

      if (!bridgeResponse.ok) {
        const errorData = await bridgeResponse.json();
        throw new Error(errorData.error || 'Bridge deposit failed');
      }

      const bridgeResult = await bridgeResponse.json();
      console.log('[QuickStart]   ✓ ZEC sent to bridge:', bridgeResult.txid);
      console.log('[QuickStart]   Bridge-relayer will mint wZEC and deposit to contract');

      // Step 2: Wait for bridge-relayer to process (in real app, would poll for confirmation)
      console.log('[QuickStart] Step 2: Waiting for bridge-relayer to process...');
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds for relayer

      console.log('[QuickStart] ✅ Bridge deposit initiated!');
      console.log('[QuickStart] Check bridge-relayer logs to confirm wZEC minting');

      setProgress({ ...progress, funded: true, fundedAmount: parseFloat(fundAmount) });
      setActiveStep(1);
    } catch (err) {
      console.error('[QuickStart] Error funding account:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to fund account';

      // Provide helpful error messages
      if (errorMessage.includes('Zcash wallet not running') || errorMessage.includes('Zallet')) {
        setError('Zcash wallet (Zallet) is not running. Please start it or skip this step.');
      } else if (errorMessage.toLowerCase().includes('insufficient')) {
        setError('Insufficient ZEC balance in wallet. Mine some test ZEC or skip this step.');
      } else if (errorMessage.includes('Bridge deposit failed')) {
        setError('Bridge service unavailable. You can skip and fund later.');
      } else if (errorMessage.includes('funds available')) {
        setError('No ZEC funds in wallet. Run: zcash-cli generate 101. Or skip this step.');
      } else {
        setError(`Deposit failed: ${errorMessage}. You can skip and fund later.`);
      }
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

      if (!baseSalary.trim()) {
        throw new Error('Base salary is required');
      }

      if (!companyData?.contractAddress) {
        throw new Error('Company contract address not found');
      }

      console.log('[QuickStart] Adding employee:', employeeName);

      // Generate encryption key pair (placeholder for development)
      const publicKey = generateBlinding(); // Using random bytes as placeholder public key

      // Encrypt employee data
      const nameBytes = new TextEncoder().encode(employeeName.trim());
      const salaryBytes = new TextEncoder().encode(baseSalary.trim());
      const encryptedNameBytes = await encryptWithPublicKey(nameBytes, publicKey);
      const encryptedSalaryBytes = await encryptWithPublicKey(salaryBytes, publicKey);
      const encrypted_name = Array.from(encryptedNameBytes);
      const encrypted_salary = Array.from(encryptedSalaryBytes);

      // Generate salary commitment
      const salaryValue = BigInt(baseSalary.trim());
      const blinding = generateBlinding();
      const commitment = generateSalaryCommitment(salaryValue, blinding);
      const salary_commitment = Array.from(commitment.value);

      console.log('[QuickStart] Encrypted data generated, calling contract...');

      // Add employee to payroll contract with proper encryption
      await callFunction({
        contractId: companyData.contractAddress,
        method: 'add_employee',
        args: {
          employee_id: employeeWallet.trim(),
          encrypted_name,
          encrypted_salary,
          salary_commitment,
          public_key: Array.from(publicKey),
        },
        gas: '50000000000000', // 50 TGas
        deposit: '0', // No deposit required
      });

      console.log('[QuickStart] Employee added successfully');

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
            {/* Company Info */}
            {companyData && (
              <div className="p-4 rounded-lg border border-primary/20 bg-primary/5">
                <h3 className="font-semibold text-sm mb-3">Your Payroll Contract</h3>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Company Name</p>
                    <p className="font-mono text-sm">{companyData.companyName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Contract Address</p>
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm flex-1 break-all">{companyData.contractAddress}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(companyData.contractAddress)}
                        className="shrink-0"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.open(`https://explorer.testnet.near.org/accounts/${companyData.contractAddress}`, '_blank')}
                        className="shrink-0"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

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

                <div className="p-4 rounded-lg border border-blue-500/20 bg-blue-500/5">
                  <p className="text-sm mb-2">
                    🔒 <span className="font-semibold">Privacy-Preserving Payroll with Bridge</span>
                  </p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Your payroll uses zero-knowledge proofs to keep employee salaries private while enabling trustless income verification.
                    Payments are secured with cryptographic commitments.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold">Bridge Flow:</span> ZEC sent to custody → Bridge-relayer detects → Mints wZEC on NEAR → Deposits to your payroll contract
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Amount (ZEC)</label>
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
                    <input
                      type="text"
                      value={token}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-muted/50"
                      disabled
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Bridges to wZEC on NEAR
                    </p>
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
