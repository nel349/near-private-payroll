'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Send, FileCheck, ArrowRight } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();

  return (
    <div className="container mx-auto px-6 py-12">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">Welcome to Your Dashboard</h2>
        <p className="text-muted-foreground">
          Select an action below to get started with private payroll
        </p>
      </div>

      {/* Action Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
        {/* Company Dashboard */}
        <Card className="hover:shadow-accent hover:-translate-y-1 transition-all duration-300 cursor-pointer">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Company Dashboard</CardTitle>
            <CardDescription>
              Manage employees and process payroll
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Add and manage employees
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Process monthly payroll
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                View payment history
              </li>
            </ul>
            <Button className="w-full mt-4" onClick={() => router.push('/dashboard/company')}>
              Open Company Dashboard
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>

        {/* Employee Dashboard */}
        <Card className="hover:shadow-accent hover:-translate-y-1 transition-all duration-300 cursor-pointer">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <Send className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Employee Dashboard</CardTitle>
            <CardDescription>
              View income and generate proofs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                View payment history
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Generate income proofs
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Withdraw funds
              </li>
            </ul>
            <Button className="w-full mt-4" onClick={() => router.push('/dashboard/employee')}>
              Open Employee Dashboard
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>

        {/* Zcash Bridge */}
        <Card className="hover:shadow-accent hover:-translate-y-1 transition-all duration-300 cursor-pointer md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <FileCheck className="w-6 h-6 text-primary" />
                </div>
                <CardTitle>Zcash Bridge</CardTitle>
                <CardDescription>
                  Bridge wZEC tokens between NEAR and Zcash for enhanced privacy
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-2">NEAR → Zcash</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Withdraw wZEC from NEAR to Zcash shielded address for maximum privacy
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Zcash → NEAR</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Deposit ZEC from Zcash to NEAR as wZEC tokens
                </p>
              </div>
            </div>
            <Button className="w-full" onClick={() => router.push('/dashboard/bridge')}>
              Open Bridge
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
