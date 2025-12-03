'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, ArrowLeft, Loader2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWalletSelector } from '@near-wallet-selector/react-hook';

interface AuditorFormData {
  fullName: string;
  email: string;
  licenseType: string;
  licenseNumber: string;
  licenseState: string;
  firmName: string;
  yearsExperience: string;
  companyContractAddress: string;
}

export default function AuditorApplicationPage() {
  const router = useRouter();
  const { signedAccountId } = useWalletSelector();

  const [formData, setFormData] = useState<AuditorFormData>({
    fullName: '',
    email: '',
    licenseType: '',
    licenseNumber: '',
    licenseState: '',
    firmName: '',
    yearsExperience: '',
    companyContractAddress: '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof AuditorFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [licenseFile, setLicenseFile] = useState<File | null>(null);

  const licenseTypes = [
    'CPA (Certified Public Accountant)',
    'CA (Chartered Accountant)',
    'ACCA (Association of Chartered Certified Accountants)',
    'CIA (Certified Internal Auditor)',
    'Other Professional License',
  ];

  const experienceLevels = [
    '0-2 years',
    '3-5 years',
    '6-10 years',
    '11-15 years',
    '16-20 years',
    '20+ years',
  ];

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof AuditorFormData, string>> = {};

    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.licenseType) {
      newErrors.licenseType = 'License type is required';
    }

    if (!formData.licenseNumber.trim()) {
      newErrors.licenseNumber = 'License number is required';
    }

    if (!formData.licenseState.trim()) {
      newErrors.licenseState = 'License state/jurisdiction is required';
    }

    if (!formData.yearsExperience) {
      newErrors.yearsExperience = 'Years of experience is required';
    }

    if (!formData.companyContractAddress.trim()) {
      newErrors.companyContractAddress = 'Company contract address is required';
    }

    if (!licenseFile) {
      setError('Please upload a copy of your professional license');
      return false;
    }

    if (!signedAccountId) {
      setError('Please connect your NEAR wallet before applying');
      return false;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        setError('Please upload a JPEG, PNG, or PDF file');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB');
        return;
      }

      setLicenseFile(file);
      setError(null);
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      console.log('[AuditorApplication] Submitting application...', formData);

      // TODO: Submit application to contract
      // Save application data to localStorage for now
      const applicationId = `APP-${Date.now()}`;

      localStorage.setItem('user_role', 'auditor');
      localStorage.setItem('auditorApplicationId', applicationId);
      localStorage.setItem('auditorApplicationStatus', 'pending');
      localStorage.setItem('auditorApplicationData', JSON.stringify({
        ...formData,
        walletAddress: signedAccountId,
        submittedAt: new Date().toISOString(),
      }));

      console.log(`[AuditorApplication] Application submitted: ${applicationId}`);

      // Navigate to auditor dashboard
      router.push('/dashboard/auditor');
    } catch (err) {
      console.error('[AuditorApplication] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit application');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="w-full max-w-3xl mx-auto">
        <Button variant="outline" onClick={() => router.push('/select-role')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <Card className="border-border/50">
          <CardHeader className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <div>
              <CardTitle className="text-3xl font-bold">Auditor Application</CardTitle>
              <CardDescription className="text-base mt-2">
                Complete the form below to apply for the NEAR Private Payroll verification marketplace
              </CardDescription>
            </div>
            {signedAccountId && (
              <div className="inline-block px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-500 text-sm">
                Wallet: {signedAccountId.slice(0, 12)}...{signedAccountId.slice(-8)}
              </div>
            )}
          </CardHeader>

          <CardContent className="space-y-8">
            {error && (
              <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/10 text-red-500 text-sm">
                {error}
              </div>
            )}

            {/* Company Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Company Information</h3>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Company Contract Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="contract.near"
                  value={formData.companyContractAddress}
                  onChange={(e) => setFormData({ ...formData, companyContractAddress: e.target.value })}
                  className={`w-full px-3 py-2 rounded-lg border ${
                    errors.companyContractAddress ? 'border-red-500' : 'border-border'
                  } bg-background font-mono text-sm`}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Paste the company's payroll contract address
                </p>
                {errors.companyContractAddress && (
                  <p className="text-red-500 text-sm mt-1">{errors.companyContractAddress}</p>
                )}
              </div>
            </div>

            {/* Personal Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Personal Information</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      errors.fullName ? 'border-red-500' : 'border-border'
                    } bg-background`}
                  />
                  {errors.fullName && (
                    <p className="text-red-500 text-sm mt-1">{errors.fullName}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      errors.email ? 'border-red-500' : 'border-border'
                    } bg-background`}
                  />
                  {errors.email && (
                    <p className="text-red-500 text-sm mt-1">{errors.email}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Professional Credentials */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Professional Credentials</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    License Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.licenseType}
                    onChange={(e) => setFormData({ ...formData, licenseType: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      errors.licenseType ? 'border-red-500' : 'border-border'
                    } bg-background`}
                  >
                    <option value="">Select license type</option>
                    {licenseTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  {errors.licenseType && (
                    <p className="text-red-500 text-sm mt-1">{errors.licenseType}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    License Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.licenseNumber}
                    onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      errors.licenseNumber ? 'border-red-500' : 'border-border'
                    } bg-background`}
                  />
                  {errors.licenseNumber && (
                    <p className="text-red-500 text-sm mt-1">{errors.licenseNumber}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    License State/Jurisdiction <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., California, New York, Ontario"
                    value={formData.licenseState}
                    onChange={(e) => setFormData({ ...formData, licenseState: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      errors.licenseState ? 'border-red-500' : 'border-border'
                    } bg-background`}
                  />
                  {errors.licenseState && (
                    <p className="text-red-500 text-sm mt-1">{errors.licenseState}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Firm Name</label>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={formData.firmName}
                    onChange={(e) => setFormData({ ...formData, firmName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-2">
                    Years of Experience <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.yearsExperience}
                    onChange={(e) => setFormData({ ...formData, yearsExperience: e.target.value })}
                    className={`w-full px-3 py-2 rounded-lg border ${
                      errors.yearsExperience ? 'border-red-500' : 'border-border'
                    } bg-background`}
                  >
                    <option value="">Select experience level</option>
                    {experienceLevels.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                  {errors.yearsExperience && (
                    <p className="text-red-500 text-sm mt-1">{errors.yearsExperience}</p>
                  )}
                </div>
              </div>
            </div>

            {/* License Upload */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">License Verification</h3>
              <p className="text-sm text-muted-foreground">
                Upload a copy of your professional license (JPEG, PNG, or PDF, max 5MB)
              </p>

              <label className={`block p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                licenseFile
                  ? 'border-green-500 bg-green-500/5'
                  : 'border-border hover:border-primary hover:bg-primary/5'
              }`}>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/jpg,application/pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div className="text-center">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {licenseFile ? licenseFile.name : 'Choose License File'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click to upload or drag and drop
                  </p>
                </div>
              </label>
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
                type="button"
                className="flex-1"
                onClick={handleSubmit}
                disabled={isSubmitting || !signedAccountId}
              >
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isSubmitting ? 'Submitting...' : 'Submit Application'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
