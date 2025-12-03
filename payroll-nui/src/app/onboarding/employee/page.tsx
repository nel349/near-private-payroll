'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { User, ArrowLeft, Loader2, CheckCircle, Building } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWalletSelector } from '@near-wallet-selector/react-hook';

export default function EmployeeOnboardingPage() {
  const router = useRouter();
  const { signedAccountId, viewFunction } = useWalletSelector();

  const [contractAddress, setContractAddress] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);

  const handleVerify = async () => {
    if (!signedAccountId) {
      setError('Please connect your wallet first');
      return;
    }

    if (!contractAddress.trim()) {
      setError('Please enter a company contract address');
      return;
    }

    setIsVerifying(true);
    setError(null);
    setSuccess(false);

    try {
      console.log(`[EmployeeOnboarding] Verifying employment at ${contractAddress}...`);

      // Call the contract to verify employee exists (view method)
      const employee = await viewFunction({
        contractId: contractAddress.trim(),
        method: 'get_employee',
        args: { employee_id: signedAccountId },
      });

      if (!employee) {
        throw new Error('You are not registered as an employee at this company. Please contact your employer.');
      }

      console.log('[EmployeeOnboarding] Employee found:', employee);

      // Try to get company name from contract stats (best effort)
      let companyName = 'Your Company';
      try {
        // We can infer company name from contract address
        const contractParts = contractAddress.split('.');
        if (contractParts.length > 1) {
          companyName = contractParts[0]
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
        }
      } catch (e) {
        console.warn('[EmployeeOnboarding] Could not determine company name');
      }

      // Save to localStorage
      localStorage.setItem('user_role', 'employee');
      localStorage.setItem('employer_contract', contractAddress.trim());
      localStorage.setItem('employer_data', JSON.stringify({
        contractAddress: contractAddress.trim(),
        companyName,
        joinedAt: new Date().toISOString(),
      }));

      setCompanyName(companyName);
      setSuccess(true);

      // Redirect to employee dashboard after 2 seconds
      setTimeout(() => {
        router.push('/dashboard/employee');
      }, 2000);
    } catch (err) {
      console.error('[EmployeeOnboarding] Verification failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to verify employment';

      // Provide more helpful error messages
      if (errorMessage.includes('not registered') || errorMessage.includes('not found')) {
        setError('You are not registered as an employee at this company. Please contact your employer.');
      } else if (errorMessage.includes('does not exist') || errorMessage.includes('contract')) {
        setError('Invalid contract address. Please check the address and try again.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-lg">
        <Button variant="outline" onClick={() => router.push('/select-role')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <Card className="border-border/50">
          <CardHeader className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <User className="w-8 h-8 text-primary" />
            </div>
            <div>
              <CardTitle className="text-3xl font-bold">Join as Employee</CardTitle>
              <CardDescription className="text-base mt-2">
                Enter the company contract address provided by your employer
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Wallet Address Display */}
            <div>
              <label className="block text-sm font-medium mb-2">Your Wallet Address</label>
              <div className="p-3 rounded-lg border border-border bg-muted/30 font-mono text-sm break-all">
                {signedAccountId || 'Not connected'}
              </div>
            </div>

            {/* Contract Address Input */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Company Contract Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="contract.near"
                value={contractAddress}
                onChange={(e) => setContractAddress(e.target.value)}
                disabled={isVerifying || success}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Ask your employer for this address
              </p>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/10 text-red-500 text-sm">
                {error}
              </div>
            )}

            {/* Success Alert */}
            {success && companyName && (
              <div className="p-4 rounded-lg border border-green-500/20 bg-green-500/10">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-green-500">
                      Success! You're registered at {companyName}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Redirecting to dashboard...
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Verify Button */}
            <Button
              className="w-full"
              onClick={handleVerify}
              disabled={isVerifying || success || !contractAddress.trim()}
            >
              {isVerifying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {!isVerifying && !success && <Building className="w-4 h-4 mr-2" />}
              {success ? 'Verified!' : isVerifying ? 'Verifying...' : 'Verify & Join'}
            </Button>

            {/* Cancel Button */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push('/select-role')}
              disabled={isVerifying || success}
            >
              Back
            </Button>

            {/* Info Box */}
            <div className="p-4 rounded-lg border border-primary/20 bg-primary/5">
              <p className="font-semibold text-sm text-primary mb-2">
                How to get the contract address?
              </p>
              <ol className="space-y-1 text-sm text-muted-foreground">
                <li>1. Contact your employer (HR or payroll admin)</li>
                <li>2. They will provide the company contract address</li>
                <li>3. Paste it above and click "Verify & Join"</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
