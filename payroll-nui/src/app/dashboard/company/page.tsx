'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, UserPlus, Wallet, Send, Calendar, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FundAccountDialog } from '@/components/fund-account-dialog';
import { AddEmployeeDialog } from '@/components/add-employee-dialog';
import { RecurringPaymentDialog } from '@/components/recurring-payment-dialog';
import { PayEmployeeDialog } from '@/components/pay-employee-dialog';
import { useCompanyDashboard, useCompanyEmployees } from '@/lib/hooks/use-payroll-queries';

export default function CompanyDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'employees' | 'payments'>('overview');

  // Centralized dashboard queries
  const {
    companyData,
    contractAddress,
    balance,
    employeeCount,
    totalPayments,
    isLoadingBalance,
    isLoadingStats,
  } = useCompanyDashboard();

  // Load company keypair for decrypting employee names
  const [keypair, setKeypair] = useState<{ privateKey: number[]; publicKey: number[] } | null>(null);

  useEffect(() => {
    const keypairData = localStorage.getItem('company_keypair');
    if (keypairData) {
      try {
        setKeypair(JSON.parse(keypairData));
      } catch (err) {
        console.error('[CompanyDashboard] Failed to load keypair:', err);
      }
    }
  }, []);

  // Fetch employees with decrypted names and salaries
  const { data: employees, isLoading: isLoadingEmployees } = useCompanyEmployees(
    contractAddress,
    keypair
  );

  // Dialog states
  const [showFundDialog, setShowFundDialog] = useState(false);
  const [showAddEmployeeDialog, setShowAddEmployeeDialog] = useState(false);
  const [showRecurringDialog, setShowRecurringDialog] = useState(false);
  const [showPayEmployeeDialog, setShowPayEmployeeDialog] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<{ id: string; name: string; salary: string } | null>(null);

  // Handlers - TanStack Query will auto-refresh the data
  const handleFundSuccess = (amount: number, txid: string) => {
    console.log('[Dashboard] Fund success:', amount, 'ZEC, txid:', txid);
    // TanStack Query mutation will auto-invalidate and refetch balance
  };

  const handleEmployeeAdded = (employee: { id: string; name: string; salary: string }) => {
    console.log('[Dashboard] Employee added:', employee);
    // TanStack Query mutation will auto-invalidate and refetch stats
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
        {contractAddress && (
          <p className="text-xs text-muted-foreground mt-2">
            Contract: <span className="font-mono">{contractAddress}</span>
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
            <div className="text-2xl font-bold">
              {isLoadingStats ? (
                <span className="text-muted-foreground">Loading...</span>
              ) : (
                employeeCount
              )}
            </div>
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
            <div className="text-2xl font-bold">
              {isLoadingStats ? (
                <span className="text-muted-foreground">Loading...</span>
              ) : (
                totalPayments
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Processed all time
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
              {isLoadingBalance ? (
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
              <Button className="w-full justify-start" onClick={() => setShowPayEmployeeDialog(true)}>
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
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Employee Management</CardTitle>
                <CardDescription>
                  Add and manage employees on your private payroll
                </CardDescription>
              </div>
              <Button onClick={() => setShowAddEmployeeDialog(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                Add Employee
              </Button>
            </CardHeader>
            <CardContent>
              {isLoadingEmployees ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  <span className="ml-3 text-muted-foreground">Loading employees...</span>
                </div>
              ) : employees && employees.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Name</th>
                        <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Wallet Address</th>
                        <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Salary (wZEC)</th>
                        <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Status</th>
                        <th className="text-right py-3 px-4 font-medium text-sm text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((employee) => (
                        <tr key={employee.id} className="border-b border-border hover:bg-muted/50">
                          <td className="py-3 px-4 font-medium">{employee.name}</td>
                          <td className="py-3 px-4 font-mono text-sm text-muted-foreground">{employee.id}</td>
                          <td className="py-3 px-4">{employee.salary}</td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              employee.status === 'Active'
                                ? 'bg-green-500/10 text-green-500'
                                : 'bg-gray-500/10 text-gray-500'
                            }`}>
                              {employee.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedEmployee({
                                  id: employee.id,
                                  name: employee.name,
                                  salary: employee.salary
                                });
                                setShowPayEmployeeDialog(true);
                              }}
                            >
                              <Send className="w-4 h-4 mr-2" />
                              Pay
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="mb-4">No employees added yet</p>
                  <Button onClick={() => setShowAddEmployeeDialog(true)}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add First Employee
                  </Button>
                </div>
              )}
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
      {showFundDialog && contractAddress && (
        <FundAccountDialog
          companyId={contractAddress}
          onSuccess={handleFundSuccess}
          onClose={() => setShowFundDialog(false)}
        />
      )}

      {/* Add Employee Dialog */}
      {showAddEmployeeDialog && contractAddress && (
        <AddEmployeeDialog
          companyId={contractAddress}
          onSuccess={handleEmployeeAdded}
          onClose={() => setShowAddEmployeeDialog(false)}
        />
      )}

      {/* Recurring Payment Dialog */}
      {showRecurringDialog && contractAddress && (
        <RecurringPaymentDialog
          companyId={contractAddress}
          onSuccess={(config) => {
            console.log('[Dashboard] Recurring payment configured:', config);
          }}
          onClose={() => setShowRecurringDialog(false)}
        />
      )}

      {/* Pay Employee Dialog */}
      {showPayEmployeeDialog && contractAddress && (
        <PayEmployeeDialog
          companyId={contractAddress}
          employeeId={selectedEmployee?.id}
          employeeName={selectedEmployee?.name}
          suggestedAmount={selectedEmployee?.salary}
          onSuccess={(payment) => {
            console.log('[Dashboard] Payment processed:', payment);
            setSelectedEmployee(null);
            // TanStack Query mutation will auto-invalidate and refetch data
          }}
          onClose={() => {
            setShowPayEmployeeDialog(false);
            setSelectedEmployee(null);
          }}
        />
      )}
    </div>
  );
}
