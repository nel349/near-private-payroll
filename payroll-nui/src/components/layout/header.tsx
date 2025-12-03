'use client';

import { Button } from '@/components/ui/button';
import { Wallet, LogOut, ArrowLeftRight } from 'lucide-react';
import { useWalletSelector } from '@near-wallet-selector/react-hook';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Header() {
  const { signedAccountId, signIn, signOut } = useWalletSelector();
  const pathname = usePathname();
  const [action, setAction] = useState<() => void>(() => () => {});
  const [label, setLabel] = useState<string>('Connect Wallet');

  // Only show bridge link in dashboard pages
  const showBridgeLink = pathname?.startsWith('/dashboard');

  useEffect(() => {
    if (signedAccountId) {
      setAction(() => signOut);
      setLabel(signedAccountId);
    } else {
      setAction(() => signIn);
      setLabel('Connect Wallet');
    }
  }, [signedAccountId, signIn, signOut]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-lg">
      <nav className="container mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/select-role" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <span className="text-white font-bold text-sm">NP</span>
          </div>
          <span className="font-bold text-lg">NEAR Private Payroll</span>
        </Link>

        {/* Navigation Links - Only show in dashboard */}
        {showBridgeLink && (
          <div className="hidden md:flex items-center gap-4">
            <Link href="/dashboard/bridge">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeftRight className="w-4 h-4" />
                Bridge
              </Button>
            </Link>
          </div>
        )}

        {/* Wallet Button */}
        <Button size="sm" onClick={action}>
          {signedAccountId ? <LogOut className="w-4 h-4" /> : <Wallet className="w-4 h-4" />}
          {label}
        </Button>
      </nav>
    </header>
  );
}
