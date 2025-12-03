'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, Shield, History, Info, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function BridgePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'history'>('deposit');

  return (
    <div className="container mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Zcash Bridge</h1>
        <p className="text-muted-foreground">
          Bridge wZEC tokens between NEAR and Zcash for enhanced privacy
        </p>
      </div>

      {/* Info Banner */}
      <Card className="mb-8 border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-primary mb-1">Privacy Notice</p>
              <p className="text-muted-foreground">
                While wZEC transfers on NEAR are public, bridging to Zcash enables fully private transactions using shielded addresses (zs1...).
                The bridge relayer automatically handles cross-chain operations.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 border-b border-border">
        <button
          onClick={() => setActiveTab('deposit')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'deposit'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Deposit (Zcash → NEAR)
        </button>
        <button
          onClick={() => setActiveTab('withdraw')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'withdraw'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Withdraw (NEAR → Zcash)
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'history'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          History
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'deposit' && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Deposit from Zcash
              </CardTitle>
              <CardDescription>
                Send ZEC from your Zcash wallet to mint wZEC on NEAR
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Your NEAR Account</label>
                <input
                  type="text"
                  readOnly
                  placeholder="account.near"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-muted/50"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Bridge Deposit Address</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value="zs1..."
                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-muted/50 font-mono text-sm"
                  />
                  <Button variant="outline" size="sm">Copy</Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Send ZEC to this address. wZEC will be minted to your NEAR account automatically.
                </p>
              </div>

              <div className="p-4 rounded-lg border border-border bg-muted/30">
                <h4 className="font-semibold text-sm mb-2">How it works:</h4>
                <ol className="space-y-1 text-sm text-muted-foreground">
                  <li>1. Send ZEC to the bridge deposit address</li>
                  <li>2. Wait for 2 confirmations on Zcash (~5 minutes)</li>
                  <li>3. wZEC tokens are automatically minted to your NEAR account</li>
                  <li>4. Check transaction status in the History tab</li>
                </ol>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Deposits</CardTitle>
              <CardDescription>Your latest deposit transactions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No deposits yet</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'withdraw' && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-primary" />
                Withdraw to Zcash
              </CardTitle>
              <CardDescription>
                Burn wZEC on NEAR to receive ZEC on Zcash
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Amount (wZEC)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  step="0.00000001"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Available: 0.00 wZEC
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Zcash Destination Address
                </label>
                <input
                  type="text"
                  placeholder="zs1... (shielded address recommended)"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Supports both transparent (t1...) and shielded (zs1...) addresses
                </p>
              </div>

              <div className="p-4 rounded-lg border border-primary/20 bg-primary/5">
                <div className="flex gap-2">
                  <Shield className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <div className="text-xs text-muted-foreground">
                    <p className="font-semibold text-primary mb-1">Privacy Recommendation</p>
                    <p>Use a shielded address (zs1...) for maximum privacy. Transparent addresses (t1...) are public on the Zcash blockchain.</p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg border border-border bg-muted/30">
                <h4 className="font-semibold text-sm mb-2">How it works:</h4>
                <ol className="space-y-1 text-sm text-muted-foreground">
                  <li>1. Enter amount and your Zcash address</li>
                  <li>2. wZEC tokens are burned on NEAR</li>
                  <li>3. Bridge relayer sends ZEC to your address</li>
                  <li>4. Receive ZEC in ~5 minutes</li>
                </ol>
              </div>

              <Button className="w-full" disabled>
                <ArrowRight className="w-4 h-4 mr-2" />
                Withdraw to Zcash
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Withdrawals</CardTitle>
              <CardDescription>Your latest withdrawal transactions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No withdrawals yet</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'history' && (
        <Card>
          <CardHeader>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>
              View all your bridge transactions between NEAR and Zcash
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="mb-2">No transactions yet</p>
              <p className="text-sm">
                Your deposits and withdrawals will appear here
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
