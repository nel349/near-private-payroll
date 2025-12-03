'use client';

import { createContext, useContext } from 'react';
import type { WalletSelector } from '@near-wallet-selector/core';
import { useWalletSelector as useWalletSelectorHook } from '@near-wallet-selector/react-hook';

interface WalletSelectorContextType {
  selector: WalletSelector | null;
}

const WalletSelectorContext = createContext<WalletSelectorContextType>({
  selector: null,
});

export function useWalletSelectorContext() {
  return useContext(WalletSelectorContext);
}

export function WalletSelectorContextProvider({ children }: { children: React.ReactNode }) {
  const walletSelectorHook = useWalletSelectorHook();
  const selector = (walletSelectorHook as any).selector || null;

  return (
    <WalletSelectorContext.Provider value={{ selector }}>
      {children}
    </WalletSelectorContext.Provider>
  );
}
