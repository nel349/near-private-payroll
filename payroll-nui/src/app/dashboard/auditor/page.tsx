'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck, FileCheck, DollarSign, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function AuditorDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'requests' | 'history'>('overview');

  return (
    <div className="container mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Auditor Dashboard</h1>
        <p className="text-muted-foreground">
          Review income proofs and provide attestations
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Reviews
            </CardTitle>
            <Clock className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground mt-1">
              Awaiting verification
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Completed
            </CardTitle>
            <FileCheck className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total verifications
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Earnings
            </CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0.00 NEAR</div>
            <p className="text-xs text-muted-foreground mt-1">
              Verification fees earned
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Status
            </CardTitle>
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">Pending</div>
            <p className="text-xs text-muted-foreground mt-1">
              Application status
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
          onClick={() => setActiveTab('requests')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'requests'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Verification Requests
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
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Application Status</CardTitle>
              <CardDescription>
                Your auditor application is pending review
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-4 rounded-lg border border-yellow-500/20 bg-yellow-500/10">
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-yellow-500 mb-1">Pending Review</p>
                    <p className="text-sm text-muted-foreground">
                      Your application is being reviewed by the company administrator. You will be notified once approved.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>How Verification Works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <span className="text-primary font-bold">1</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Receive Verification Request</h4>
                    <p className="text-sm text-muted-foreground">
                      Employees request income proof verification for loans, rentals, or credit applications
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <span className="text-primary font-bold">2</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Review ZK Proof</h4>
                    <p className="text-sm text-muted-foreground">
                      Verify the zero-knowledge proof without seeing exact salary amounts
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <span className="text-primary font-bold">3</span>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-1">Provide Attestation</h4>
                    <p className="text-sm text-muted-foreground">
                      Sign the proof with your professional credentials and earn verification fees
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'requests' && (
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Pending Verification Requests</CardTitle>
              <CardDescription>
                Income proofs awaiting your review
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <FileCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="mb-2">No verification requests</p>
                <p className="text-sm">
                  Pending requests will appear here once your application is approved
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'history' && (
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Verification History</CardTitle>
              <CardDescription>
                Your completed verifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <ShieldCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No verifications completed yet</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
