'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building, ArrowLeft, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWalletSelector } from '@near-wallet-selector/react-hook';
import { CONFIG } from '@/config/contracts';
import { generateRSAKeypair } from '@near-private-payroll/sdk';

interface CompanyFormData {
  companyName: string;
  industry: string;
  companySize: string;
  adminEmail: string;
  agreedToTerms: boolean;
}

export default function CompanyOnboardingPage() {
  const router = useRouter();
  const { callFunction, signedAccountId } = useWalletSelector();

  const [formData, setFormData] = useState<CompanyFormData>({
    companyName: '',
    industry: '',
    companySize: '',
    adminEmail: '',
    agreedToTerms: false,
  });

  const [errors, setErrors] = useState<Partial<Record<keyof CompanyFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const industries = [
    'Technology',
    'Finance',
    'Healthcare',
    'Education',
    'Retail',
    'Manufacturing',
    'Real Estate',
    'Other',
  ];

  const companySizes = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof CompanyFormData, string>> = {};

    if (!formData.companyName.trim()) {
      newErrors.companyName = 'Company name is required';
    } else if (formData.companyName.length < 2 || formData.companyName.length > 100) {
      newErrors.companyName = 'Company name must be between 2 and 100 characters';
    }

    if (!formData.adminEmail.trim()) {
      newErrors.adminEmail = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.adminEmail)) {
      newErrors.adminEmail = 'Please enter a valid email address';
    }


    if (!formData.agreedToTerms) {
      newErrors.agreedToTerms = 'You must agree to the Terms of Service';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (!signedAccountId) {
        throw new Error('Wallet not connected');
      }

      console.log('[CompanyOnboarding] Generating RSA encryption keypair...');

      // Generate company's RSA encryption keypair
      const rsaKeypair = await generateRSAKeypair();
      const keypair = {
        privateKey: Array.from(rsaKeypair.privateKey),
        publicKey: Array.from(rsaKeypair.publicKey),
      };

      console.log('[CompanyOnboarding] Saving keypair to localStorage...');

      // Save keypair directly to localStorage (unencrypted for simplicity)
      localStorage.setItem('company_keypair', JSON.stringify(keypair));

      console.log('[CompanyOnboarding] Creating company...', formData);
      console.log('[CompanyOnboarding] Calling factory to deploy payroll contract...');

      // Call factory contract to deploy new payroll contract with company's public key
      const txResult: any = await callFunction({
        contractId: CONFIG.payrollFactory,
        method: 'create_company',
        args: {
          company_name: formData.companyName,
          company_public_key: Array.from(rsaKeypair.publicKey),
        },
        gas: '300000000000000', // 300 TGas (maximum per transaction)
        deposit: '5000000000000000000000000', // 5 NEAR in yoctoNEAR
      });

      console.log('[CompanyOnboarding] Full transaction result:', txResult);

      // Extract contract address from transaction result
      // The factory's on_company_created callback returns the AccountId
      let contractAddress = '';

      // Try different paths where the return value might be
      if (txResult) {
        // Log the entire structure to see what we get
        console.log('[CompanyOnboarding] Transaction keys:', Object.keys(txResult));

        // Common paths in NEAR transaction results:
        const possiblePaths = [
          txResult,                                    // Direct return
          txResult.status?.SuccessValue,               // Encoded success value
          txResult.transaction_outcome?.outcome?.status?.SuccessValue,
          txResult.receipts_outcome?.[0]?.outcome?.status?.SuccessValue,
        ];

        for (const path of possiblePaths) {
          if (path && typeof path === 'string') {
            try {
              // Decode base64 if it's encoded
              const decoded = Buffer.from(path, 'base64').toString('utf-8');
              console.log('[CompanyOnboarding] Decoded value:', decoded);
              // Parse JSON if it's JSON-encoded
              const parsed = JSON.parse(decoded);
              if (typeof parsed === 'string' && parsed.includes('.payroll-factory.testnet')) {
                contractAddress = parsed.replace(/^"|"$/g, ''); // Remove quotes
                break;
              }
            } catch (e) {
              // Not base64 or JSON, try as direct string
              if (typeof path === 'string' && path.includes('.payroll-factory.testnet')) {
                contractAddress = path;
                break;
              }
            }
          }
        }
      }

      // If we still don't have it, check the logs
      if (!contractAddress) {
        console.log('[CompanyOnboarding] Could not extract from return value, checking logs...');
        // The factory logs: "Company contract created: {address} (owner: {owner})"
        const logs = txResult?.receipts_outcome?.flatMap((r: any) => r.outcome.logs || []) || [];
        console.log('[CompanyOnboarding] Transaction logs:', logs);

        for (const log of logs) {
          const match = log.match(/Company contract created: ([\w.-]+\.payroll-factory\.testnet)/);
          if (match) {
            contractAddress = match[1];
            console.log('[CompanyOnboarding] Extracted from log:', contractAddress);
            break;
          }
        }
      }

      if (!contractAddress) {
        throw new Error('Failed to get deployed contract address. Please check NEAR Explorer.');
      }

      console.log('[CompanyOnboarding] Contract deployed at:', contractAddress);

      // Save company data + contract address to localStorage
      localStorage.setItem('user_role', 'company');
      localStorage.setItem('company_data', JSON.stringify({
        ...formData,
        walletAddress: signedAccountId,
        contractAddress,
        createdAt: new Date().toISOString(),
      }));

      // Navigate to quick start wizard
      router.push('/onboarding/company/quickstart');
    } catch (err) {
      console.error('[CompanyOnboarding] Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to create company';

      // Provide more helpful error messages
      if (errorMessage.includes('fetch')) {
        setError('Failed to load contract WASM file. Please check your internet connection.');
      } else if (errorMessage.includes('Insufficient')) {
        setError('Insufficient NEAR balance. You need at least 5 NEAR to deploy a contract.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-2xl">
        <Button variant="outline" onClick={() => router.push('/select-role')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <Card className="border-border/50">
          <CardHeader className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Building className="w-8 h-8 text-primary" />
            </div>
            <div>
              <CardTitle className="text-3xl font-bold">Setup Your Company</CardTitle>
              <CardDescription className="text-base mt-2">
                Register your company on the NEAR Private Payroll system
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent>
            {error && (
              <div className="mb-6 p-4 rounded-lg border border-red-500/20 bg-red-500/10 text-red-500 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Company Name */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className={`w-full px-3 py-2 rounded-lg border ${
                    errors.companyName ? 'border-red-500' : 'border-border'
                  } bg-background`}
                  disabled={isSubmitting}
                />
                {errors.companyName && (
                  <p className="text-red-500 text-sm mt-1">{errors.companyName}</p>
                )}
              </div>

              {/* Industry */}
              <div>
                <label className="block text-sm font-medium mb-2">Industry</label>
                <select
                  value={formData.industry}
                  onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                  disabled={isSubmitting}
                >
                  <option value="">Select industry</option>
                  {industries.map((industry) => (
                    <option key={industry} value={industry}>
                      {industry}
                    </option>
                  ))}
                </select>
              </div>

              {/* Company Size */}
              <div>
                <label className="block text-sm font-medium mb-2">Company Size</label>
                <select
                  value={formData.companySize}
                  onChange={(e) => setFormData({ ...formData, companySize: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                  disabled={isSubmitting}
                >
                  <option value="">Select size</option>
                  {companySizes.map((size) => (
                    <option key={size} value={size}>
                      {size} employees
                    </option>
                  ))}
                </select>
              </div>

              {/* Admin Email */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Admin Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={formData.adminEmail}
                  onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                  className={`w-full px-3 py-2 rounded-lg border ${
                    errors.adminEmail ? 'border-red-500' : 'border-border'
                  } bg-background`}
                  disabled={isSubmitting}
                />
                {errors.adminEmail && (
                  <p className="text-red-500 text-sm mt-1">{errors.adminEmail}</p>
                )}
              </div>

              {/* Connected Wallet */}
              <div>
                <label className="block text-sm font-medium mb-2">Connected Wallet</label>
                <input
                  type="text"
                  value={signedAccountId || ''}
                  disabled
                  className="w-full px-3 py-2 rounded-lg border border-border bg-muted/50"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Your company will be associated with this wallet address
                </p>
              </div>

              {/* Terms Agreement */}
              <div>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={formData.agreedToTerms}
                    onChange={(e) => setFormData({ ...formData, agreedToTerms: e.target.checked })}
                    className="mt-1"
                    disabled={isSubmitting}
                  />
                  <span className="text-sm text-muted-foreground">
                    I agree to the{' '}
                    <a href="#" className="text-primary hover:underline">
                      Terms of Service
                    </a>
                  </span>
                </label>
                {errors.agreedToTerms && (
                  <p className="text-red-500 text-sm mt-1">{errors.agreedToTerms}</p>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => router.push('/select-role')}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isSubmitting}
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {isSubmitting ? 'Creating Company...' : 'Create Company →'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
