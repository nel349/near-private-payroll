'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Lock, Zap, ArrowRight, Eye, CheckCircle, Code, Coins, FileKey } from 'lucide-react';
import { GravityStarsBackground } from '@/components/animate-ui/components/backgrounds/gravity-stars';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { useWalletSelector } from '@near-wallet-selector/react-hook';

export default function Home() {
  const { signIn } = useWalletSelector();

  return (
    <>
      {/* Header */}
      <Header />

      <main className="min-h-screen bg-background relative overflow-hidden">
        {/* Animated gravity stars background */}
        <GravityStarsBackground className="absolute inset-0" />

        {/* Content */}
        <div className="relative z-10">
        {/* Hero Section - With proper spacing for header */}
        <div className="container mx-auto px-6 pt-32 pb-24 md:pt-40 md:pb-32">
          <div className="text-center space-y-10 animate-[fadeInUp_0.8s_ease-out]">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/20 bg-primary/5 backdrop-blur-sm">
              <Zap className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">Powered by RISC Zero & NEAR Protocol</span>
            </div>

            {/* Main heading with gradient */}
            <h1 className="text-6xl md:text-7xl font-bold tracking-tight">
              <span className="gradient-text">Private Payroll</span>
              <br />
              <span className="text-foreground">On NEAR Protocol</span>
            </h1>

            {/* Subheading */}
            <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              Zero-knowledge proof payroll system with cryptographic privacy.
              Process payments, verify income, and bridge to Zcash—all while keeping sensitive data private.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Button size="lg" onClick={() => window.location.href = '/select-role'}>
                Open App
                <ArrowRight className="w-5 h-5" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => window.location.href = '#how-it-works'}>
                Learn More
              </Button>
            </div>

            {/* Trust indicators */}
            <div className="flex flex-wrap justify-center gap-8 pt-8 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" />
                <span>RISC Zero Verified</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" />
                <span>On-chain Proofs</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-primary" />
                <span>Zcash Bridge</span>
              </div>
            </div>
          </div>
        </div>

        {/* Features Grid - Standardized spacing */}
        <div id="features" className="container mx-auto px-6 pb-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <Card className="group hover:shadow-accent hover:-translate-y-2">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-2xl">Private Payments</CardTitle>
                <CardDescription className="text-base">
                  Cryptographic salary commitments
                </CardDescription>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Salary amounts are hidden using Pedersen commitments. Employees receive payments while employers maintain privacy. All verified on-chain with zero-knowledge proofs.
              </CardContent>
            </Card>

            {/* Feature 2 */}
            <Card className="group hover:shadow-accent hover:-translate-y-2">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <Eye className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-2xl">Income Proofs</CardTitle>
                <CardDescription className="text-base">
                  Trustless income verification
                </CardDescription>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Generate ZK proofs about your income (threshold, range, average, credit score) without revealing exact amounts. Perfect for loans, rentals, and credit applications.
              </CardContent>
            </Card>

            {/* Feature 3 */}
            <Card className="group hover:shadow-accent hover:-translate-y-2">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <Lock className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-2xl">Zcash Bridge</CardTitle>
                <CardDescription className="text-base">
                  Cross-chain privacy layer
                </CardDescription>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Bridge wZEC tokens between NEAR and Zcash for enhanced privacy. Leverage Zcash's shielded pools for truly private transactions with full bidirectional support.
              </CardContent>
            </Card>
          </div>
        </div>

        {/* How It Works Section - Standardized spacing */}
        <div id="how-it-works" className="container mx-auto px-6 py-24 border-t border-border/50">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-6">How It Works</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Three simple steps to private payroll
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-5xl mx-auto">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center text-2xl font-bold text-primary mx-auto">
                1
              </div>
              <h3 className="text-xl font-semibold">Connect Wallet</h3>
              <p className="text-muted-foreground">
                Connect your NEAR wallet to get started. No KYC, no personal data required.
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center text-2xl font-bold text-primary mx-auto">
                2
              </div>
              <h3 className="text-xl font-semibold">Add Employees</h3>
              <p className="text-muted-foreground">
                Register employees with committed salaries. Only you know the amounts.
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center text-2xl font-bold text-primary mx-auto">
                3
              </div>
              <h3 className="text-xl font-semibold">Process Payroll</h3>
              <p className="text-muted-foreground">
                Pay employees with ZK proofs. Amounts stay private, verification stays public.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>

    {/* Footer */}
    <Footer />
    </>
  );
}