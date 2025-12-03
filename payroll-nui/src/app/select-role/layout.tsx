'use client';

import { Header } from '@/components/layout/header';
import { WalletGuard } from '@/components/wallet-guard';
import { ReactNode } from 'react';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <WalletGuard>
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-16">
          {children}
        </main>
      </div>
    </WalletGuard>
  );
}
