'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Send, ArrowRight, ShieldCheck } from 'lucide-react';

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl">
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
            <Button className="w-full mt-4" onClick={() => router.push('/onboarding/company')}>
              Setup Company
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
            <Button className="w-full mt-4" onClick={() => router.push('/onboarding/employee')}>
              Join as Employee
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>

        {/* Auditor */}
        <Card className="hover:shadow-accent hover:-translate-y-1 transition-all duration-300 cursor-pointer">
          <CardHeader>
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6 text-primary" />
            </div>
            <CardTitle>Auditor / Verifier</CardTitle>
            <CardDescription>
              Verify income proofs and provide attestations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Review income proofs
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Provide attestations
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                Earn verification fees
              </li>
            </ul>
            <Button className="w-full mt-4" onClick={() => router.push('/onboarding/auditor')}>
              Apply as Auditor
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
