'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, UserPlus, Wallet, Send, Calendar } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWalletSelector } from '@near-wallet-selector/react-hook';
import { CONFIG } from '@/config/contracts';
import { FundAccountDialog } from '@/components/fund-account-dialog';
import { AddEmployeeDialog } from '@/components/add-employee-dialog';
import { RecurringPaymentDialog } from '@/components/recurring-payment-dialog';

export default function CompanyDashboardPage() {
  const router = useRouter();
  const { viewFunction } = useWalletSelector();
  const [activeTab, setActiveTab] = useState<'overview' | 'employees' | 'payments'>('overview');

  // Company data and stats
  const [companyData, setCompanyData] = useState<any>(null);
  const [balance, setBalance] = useState<string>('0.00');
  const [employeeCount, setEmployeeCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  // Dialog states
  const [showFundDialog, setShowFundDialog] = useState(false);
  const [showAddEmployeeDialog, setShowAddEmployeeDialog] = useState(false);
  const [showRecurringDialog, setShowRecurringDialog] = useState(false);

  // Load company data and fetch balance
  useEffect(() => {
    const loadCompanyData = () => {
      const data = localStorage.getItem('company_data');
      if (data) {
        setCompanyData(JSON.parse(data));
      }
    };

    loadCompanyData();
  }, []);

  // Fetch balance when company data is loaded
  useEffect(() => {
    const fetchBalance = async () => {
      if (!companyData?.contractAddress) return;

      try {
        setIsLoading(true);

        console.log('[Dashboard] Fetching balance for:', companyData.contractAddress);
        console.log('[Dashboard] wZEC token contract:', CONFIG.wzecToken);

        // Query wZEC balance of the payroll contract
        const balanceResult = await viewFunction({
          contractId: CONFIG.wzecToken,
          method: 'ft_balance_of',
          args: {
            account_id: companyData.contractAddress,
          },
        });

        console.log('[Dashboard] Raw balance result:', balanceResult);

        // Convert from smallest unit (8 decimals for ZEC)
        // Show up to 8 decimals but strip trailing zeros
        const balanceStr = typeof balanceResult === 'string' ? balanceResult : String(balanceResult || '0');
        const balanceNum = parseInt(balanceStr) / 100_000_000;
        const balanceInZEC = balanceNum.toFixed(8).replace(/\.?0+$/, '');
        setBalance(balanceInZEC);

        console.log('[Dashboard] wZEC Balance:', balanceInZEC, 'wZEC');
      } catch (error: any) {
        console.error('[Dashboard] Error fetching balance:', error);
        console.error('[Dashboard] Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });

        // Show helpful error message
        if (error.message?.includes('does not exist')) {
          console.warn('[Dashboard] wZEC token contract not deployed yet');
          setBalance('N/A');
        } else {
          setBalance('0.00');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchBalance();
  }, [companyData, viewFunction]);

  // Handle fund success - refresh balance
  const handleFundSuccess = async (amount: number, txid: string) => {
    console.log('[Dashboard] Fund success:', amount, 'ZEC, txid:', txid);
    // Wait a bit for bridge-relayer to process, then refresh balance
    setTimeout(async () => {
      if (!companyData?.contractAddress) return;

      try {
        const balanceResult = await viewFunction({
          contractId: CONFIG.wzecToken,
          method: 'ft_balance_of',
          args: { account_id: companyData.contractAddress },
        });
        const balanceStr = typeof balanceResult === 'string' ? balanceResult : String(balanceResult || '0');
        const balanceNum = parseInt(balanceStr) / 100_000_000;
        const balanceInZEC = balanceNum.toFixed(8).replace(/\.?0+$/, '');
        setBalance(balanceInZEC);
      } catch (error) {
        console.error('[Dashboard] Error refreshing balance:', error);
      }
    }, 5000); // Wait 5 seconds for bridge-relayer
  };

  return (
    <div className="container mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">
          {companyData?.companyName || 'Company'} Dashboard
        </h1>
        <p className="text-muted-foreground">
          Manage your employees and process payroll with zero-knowledge privacy
        </p>
        {companyData?.contractAddress && (
          <p className="text-xs text-muted-foreground mt-2">
            Contract: <span className="font-mono">{companyData.contractAddress}</span>
          </p>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Employees
            </CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground mt-1">
              Active employees on payroll
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Payments
            </CardTitle>
            <Send className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground mt-1">
              Processed this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Company Balance
            </CardTitle>
            <Wallet className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? (
                <span className="text-muted-foreground">Loading...</span>
              ) : (
                <>{balance} wZEC</>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Available for payroll
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
          onClick={() => setActiveTab('employees')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'employees'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Employees
        </button>
        <button
          onClick={() => setActiveTab('payments')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'payments'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Process Payment
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Welcome to Company Dashboard</CardTitle>
              <CardDescription>
                Get started by adding employees and funding your payroll balance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <span className="text-primary font-bold">1</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Fund Your Balance</h4>
                    <p className="text-sm text-muted-foreground">
                      Transfer wZEC tokens to your company balance to pay employees
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <span className="text-primary font-bold">2</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Add Employees</h4>
                    <p className="text-sm text-muted-foreground">
                      Register employees with encrypted salary commitments
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <span className="text-primary font-bold">3</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Process Payroll</h4>
                    <p className="text-sm text-muted-foreground">
                      Pay employees with zero-knowledge proofs that verify amounts match commitments
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full justify-start" onClick={() => setShowFundDialog(true)}>
                <Wallet className="w-4 h-4 mr-2" />
                Fund Account
              </Button>
              <Button className="w-full justify-start" onClick={() => setShowAddEmployeeDialog(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                Add Employee
              </Button>
              <Button className="w-full justify-start" onClick={() => setShowRecurringDialog(true)}>
                <Calendar className="w-4 h-4 mr-2" />
                Setup Recurring Payment
              </Button>
              <Button className="w-full justify-start" onClick={() => setActiveTab('payments')}>
                <Send className="w-4 h-4 mr-2" />
                Process Payment
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'employees' && (
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Employee Management</CardTitle>
              <CardDescription>
                Add and manage employees on your private payroll
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="mb-4">No employees added yet</p>
                <Button>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add First Employee
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'payments' && (
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Process Payroll</CardTitle>
              <CardDescription>
                Pay your employees with zero-knowledge proof verification
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <Send className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Add employees first to process payments</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Fund Account Dialog */}
      {showFundDialog && companyData?.contractAddress && (
        <FundAccountDialog
          companyId={companyData.contractAddress}
          onSuccess={handleFundSuccess}
          onClose={() => setShowFundDialog(false)}
        />
      )}

      {/* Add Employee Dialog */}
      {showAddEmployeeDialog && companyData?.contractAddress && (
        <AddEmployeeDialog
          companyId={companyData.contractAddress}
          onSuccess={(employee) => {
            console.log('[Dashboard] Employee added:', employee);
            // Optionally refresh employee list
          }}
          onClose={() => setShowAddEmployeeDialog(false)}
        />
      )}

      {/* Recurring Payment Dialog */}
      {showRecurringDialog && companyData?.contractAddress && (
        <RecurringPaymentDialog
          companyId={companyData.contractAddress}
          onSuccess={(config) => {
            console.log('[Dashboard] Recurring payment configured:', config);
          }}
          onClose={() => setShowRecurringDialog(false)}
        />
      )}
    </div>
  );
}
