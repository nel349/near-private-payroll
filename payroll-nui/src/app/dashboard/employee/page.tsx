'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, History, FileCheck, Shield, Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEmployeeDashboard } from '@/lib/hooks/use-payroll-queries';

export default function EmployeeDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'payments' | 'proofs' | 'withdraw'>('overview');

  // Centralized dashboard queries
  const {
    signedAccountId,
    companyContractId,
    employeeData,
    availableBalance,
    lentBalance,
    paymentCount,
    isLoadingStats,
  } = useEmployeeDashboard();

  return (
    <div className="container mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Employee Dashboard</h1>
        <p className="text-muted-foreground">
          View your private income and generate zero-knowledge proofs
        </p>
        {signedAccountId && (
          <p className="text-xs text-muted-foreground mt-2">
            Account: <span className="font-mono">{signedAccountId}</span>
          </p>
        )}
        {companyContractId && (
          <p className="text-xs text-muted-foreground mt-1">
            Company Contract: <span className="font-mono">{companyContractId}</span>
          </p>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Available Balance
            </CardTitle>
            <Wallet className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoadingStats ? (
                <span className="text-muted-foreground">Loading...</span>
              ) : (
                <>{availableBalance} wZEC</>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Ready to withdraw
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Lent Balance
            </CardTitle>
            <Shield className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoadingStats ? (
                <span className="text-muted-foreground">Loading...</span>
              ) : (
                <>{lentBalance} wZEC</>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              In DeFi protocols
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Payments
            </CardTitle>
            <History className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoadingStats ? (
                <span className="text-muted-foreground">Loading...</span>
              ) : (
                paymentCount
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Payments received
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 border-b border-border">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'overview'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'payments'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Payment History
        </button>
        <button
          onClick={() => setActiveTab('proofs')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'proofs'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Income Proofs
        </button>
        <button
          onClick={() => setActiveTab('withdraw')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'withdraw'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Withdraw
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Welcome to Your Employee Dashboard</CardTitle>
              <CardDescription>
                Manage your private income with zero-knowledge proofs
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <Wallet className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">View Balance</h4>
                    <p className="text-sm text-muted-foreground">
                      Your salary is encrypted on-chain. Only you can decrypt and see the exact amount.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <FileCheck className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Generate Income Proofs</h4>
                    <p className="text-sm text-muted-foreground">
                      Create ZK proofs about your income without revealing exact amounts (for loans, credit checks, etc.)
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <Download className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Withdraw Funds</h4>
                    <p className="text-sm text-muted-foreground">
                      Withdraw to your NEAR wallet or bridge to Zcash for enhanced privacy
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Auto-Lend Configuration</CardTitle>
              <CardDescription>
                Automatically earn yield on your salary
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Auto-lend is not configured. Set up auto-lending to automatically deposit a percentage of your salary into DeFi protocols like Aave or Compound.
              </p>
              <Button variant="outline">Configure Auto-Lend</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'payments' && (
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
              <CardDescription>
                View all salary payments you've received
              </CardDescription>
            </CardHeader>
            <CardContent>
              {paymentCount > 0 ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg border border-blue-500/20 bg-blue-500/5">
                    <p className="text-sm mb-2">
                      <strong>You have {paymentCount} payment(s)</strong>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Payment history details require a contract method to be added.
                      Currently only payment count is available from the contract.
                    </p>
                  </div>

                  <div className="text-center py-8 text-muted-foreground">
                    <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p className="mb-2">Payment details coming soon</p>
                    <p className="text-xs">
                      Contract needs <code className="px-2 py-1 bg-muted rounded text-xs">list_payments()</code> method
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No payments received yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'proofs' && (
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Income Proofs</CardTitle>
              <CardDescription>
                Generate zero-knowledge proofs about your income
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Threshold Proof</CardTitle>
                    <CardDescription className="text-sm">
                      Prove income exceeds a threshold
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full" size="sm">Generate Proof</Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Range Proof</CardTitle>
                    <CardDescription className="text-sm">
                      Prove income is within a range
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full" size="sm">Generate Proof</Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Average Proof</CardTitle>
                    <CardDescription className="text-sm">
                      Prove average income over time
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full" size="sm">Generate Proof</Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Credit Score Proof</CardTitle>
                    <CardDescription className="text-sm">
                      Generate credit score based on income
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full" size="sm">Generate Proof</Button>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'withdraw' && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Withdraw to NEAR</CardTitle>
              <CardDescription>
                Withdraw wZEC tokens to your NEAR wallet
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Amount (wZEC)</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                  />
                </div>
                <Button className="w-full">Withdraw to NEAR Wallet</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Withdraw to Zcash</CardTitle>
              <CardDescription>
                Bridge to Zcash shielded address for maximum privacy
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Amount (wZEC)</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Zcash Address</label>
                  <input
                    type="text"
                    placeholder="zs1..."
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background font-mono text-sm"
                  />
                </div>
                <Button className="w-full">Bridge to Zcash</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
