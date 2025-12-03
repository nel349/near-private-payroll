'use client';

import { WalletGuard } from '@/components/wallet-guard';
import { ReactNode } from 'react';

interface OnboardingLayoutProps {
  children: ReactNode;
}

export default function OnboardingLayout({ children }: OnboardingLayoutProps) {
  return (
    <WalletGuard>
      {children}
    </WalletGuard>
  );
}
