# Frontend Integration Guide - NEAR Private Payroll with DeFi

**Version:** 1.0
**Date:** December 2, 2025
**Framework:** React + Vite (following zkSalaria architecture)
**SDK Version:** @near-private-payroll/sdk v0.1.0

## Overview

This guide shows how to build a frontend for NEAR Private Payroll with integrated DeFi features (swap + auto-lend). The architecture follows the zkSalaria pattern with React, Vite, Material-UI, and wallet integration.

---

## Table of Contents

1. [Project Setup](#project-setup)
2. [Architecture Overview](#architecture-overview)
3. [Wallet Integration](#wallet-integration)
4. [Core Components](#core-components)
5. [DeFi Widgets Integration](#defi-widgets-integration)
6. [Employee Dashboard](#employee-dashboard)
7. [Company Dashboard](#company-dashboard)
8. [State Management](#state-management)
9. [Deployment](#deployment)

---

## Project Setup

### 1. Create React + Vite Project

```bash
npm create vite@latest payroll-ui -- --template react-ts
cd payroll-ui
npm install
```

### 2. Install Dependencies

```bash
# Core dependencies
npm install react-router-dom @tanstack/react-query

# UI Framework (Material-UI like zkSalaria)
npm install @mui/material @mui/icons-material @emotion/react @emotion/styled

# NEAR & SDK
npm install near-api-js @near-wallet-selector/core @near-wallet-selector/modal-ui
npm install @near-wallet-selector/my-near-wallet @near-wallet-selector/meteor-wallet

# Our SDK with DeFi features
npm install @near-private-payroll/sdk

# Toast notifications
npm install react-hot-toast

# Dev dependencies
npm install --save-dev @types/react @types/react-dom
```

### 3. Project Structure (zkSalaria-inspired)

```
payroll-ui/
├── src/
│   ├── components/         # Reusable UI components
│   │   ├── Layout.tsx
│   │   ├── WalletButton.tsx
│   │   ├── BalanceCard.tsx
│   │   ├── SwapDialog.tsx
│   │   ├── AutoLendDialog.tsx
│   │   └── ...
│   ├── pages/             # Route pages
│   │   ├── LandingPage.tsx
│   │   ├── ConnectWalletPage.tsx
│   │   ├── EmployeeDashboard.tsx
│   │   ├── CompanyDashboard.tsx
│   │   ├── SwapPage.tsx
│   │   └── AutoLendPage.tsx
│   ├── contexts/          # React contexts
│   │   ├── WalletContext.tsx
│   │   └── PayrollContext.tsx
│   ├── hooks/             # Custom hooks
│   │   ├── usePayrollContract.ts
│   │   ├── useSwap.ts
│   │   └── useAutoLend.ts
│   ├── config/            # Configuration
│   │   └── contracts.ts
│   ├── types/             # TypeScript types
│   │   └── index.ts
│   ├── utils/             # Utility functions
│   │   └── formatting.ts
│   ├── App.tsx            # Main app with routing
│   └── main.tsx           # Entry point
├── public/
│   └── config.json        # Runtime configuration
└── package.json
```

---

## Architecture Overview

### Component Hierarchy

```
App (Router)
 └─ WalletProvider (Context)
     └─ PayrollProvider (Context)
         ├─ LandingPage
         ├─ ConnectWalletPage
         ├─ EmployeeDashboard
         │   ├─ BalanceCard
         │   ├─ SwapWidget (from @defuse-protocol/defuse-sdk)
         │   ├─ AutoLendCard
         │   └─ WithdrawalHistory
         └─ CompanyDashboard
             ├─ EmployeeList
             ├─ PaymentForm
             └─ ConfigureIntents
```

---

## Wallet Integration

### 1. Wallet Context (`src/contexts/WalletContext.tsx`)

```typescript
import React, { createContext, useContext, useEffect, useState } from 'react';
import { setupWalletSelector, WalletSelector } from '@near-wallet-selector/core';
import { setupModal, WalletSelectorModal } from '@near-wallet-selector/modal-ui';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet';
import { Account, connect, keyStores, Near } from 'near-api-js';

interface WalletContextType {
  selector: WalletSelector | null;
  modal: WalletSelectorModal | null;
  accountId: string | null;
  account: Account | null;
  near: Near | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  isConnected: boolean;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selector, setSelector] = useState<WalletSelector | null>(null);
  const [modal, setModal] = useState<WalletSelectorModal | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [near, setNear] = useState<Near | null>(null);

  useEffect(() => {
    const initWallet = async () => {
      // Initialize NEAR connection
      const nearConnection = await connect({
        networkId: 'mainnet',
        keyStore: new keyStores.BrowserLocalStorageKeyStore(),
        nodeUrl: 'https://rpc.mainnet.near.org',
        walletUrl: 'https://wallet.mainnet.near.org',
        helperUrl: 'https://helper.mainnet.near.org',
      });
      setNear(nearConnection);

      // Initialize wallet selector
      const walletSelector = await setupWalletSelector({
        network: 'mainnet',
        modules: [
          setupMyNearWallet(),
          setupMeteorWallet(),
        ],
      });
      setSelector(walletSelector);

      // Setup modal
      const walletModal = setupModal(walletSelector, {
        contractId: 'payroll.near', // Your contract ID
      });
      setModal(walletModal);

      // Check if already signed in
      const state = walletSelector.store.getState();
      if (state.accounts.length > 0) {
        const currentAccountId = state.accounts[0].accountId;
        setAccountId(currentAccountId);
        const acc = await nearConnection.account(currentAccountId);
        setAccount(acc);
      }
    };

    initWallet();
  }, []);

  const signIn = async () => {
    if (modal) {
      modal.show();
    }
  };

  const signOut = async () => {
    if (selector) {
      const wallet = await selector.wallet();
      await wallet.signOut();
      setAccountId(null);
      setAccount(null);
    }
  };

  return (
    <WalletContext.Provider
      value={{
        selector,
        modal,
        accountId,
        account,
        near,
        signIn,
        signOut,
        isConnected: !!accountId,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used within WalletProvider');
  return context;
};
```

---

## Core Components

### 2. Payroll Contract Hook (`src/hooks/usePayrollContract.ts`)

```typescript
import { useMemo } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { PrivatePayroll } from '@near-private-payroll/sdk';

export const usePayrollContract = () => {
  const { account, accountId } = useWallet();

  const payroll = useMemo(() => {
    if (!account) return null;
    return new PrivatePayroll(account, 'payroll.near'); // Your contract ID
  }, [account]);

  return { payroll, accountId, isReady: !!payroll };
};
```

### 3. Balance Card Component (`src/components/BalanceCard.tsx`)

```typescript
import React, { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Box, CircularProgress } from '@mui/material';
import { usePayrollContract } from '../hooks/usePayrollContract';

export const BalanceCard: React.FC = () => {
  const { payroll, accountId } = usePayrollContract();
  const [availableBalance, setAvailableBalance] = useState<string>('0');
  const [lentBalance, setLentBalance] = useState<string>('0');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadBalances = async () => {
      if (!payroll || !accountId) return;

      try {
        setLoading(true);
        const [available, lent] = await Promise.all([
          payroll.getBalance(accountId),
          payroll.getLentBalance(accountId),
        ]);

        setAvailableBalance(available);
        setLentBalance(lent);
      } catch (error) {
        console.error('Failed to load balances:', error);
      } finally {
        setLoading(false);
      }
    };

    loadBalances();
  }, [payroll, accountId]);

  if (loading) {
    return <CircularProgress />;
  }

  // Convert from smallest unit (8 decimals) to ZEC
  const availableZEC = (parseInt(availableBalance) / 100000000).toFixed(8);
  const lentZEC = (parseInt(lentBalance) / 100000000).toFixed(8);
  const totalZEC = (parseFloat(availableZEC) + parseFloat(lentZEC)).toFixed(8);

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Your Balance
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Total Balance
          </Typography>
          <Typography variant="h4">
            {totalZEC} ZEC
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              Available
            </Typography>
            <Typography variant="h6">
              {availableZEC} ZEC
            </Typography>
          </Box>

          <Box>
            <Typography variant="body2" color="text.secondary">
              Lent (Earning Yield)
            </Typography>
            <Typography variant="h6">
              {lentZEC} ZEC
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};
```

---

## DeFi Widgets Integration

### 4. Swap Page with NEAR Intents Widget (`src/pages/SwapPage.tsx`)

```typescript
import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Paper } from '@mui/material';
import { SwapWidget, ChainType } from '@near-private-payroll/sdk';
import { useWallet } from '../contexts/WalletContext';
import toast from 'react-hot-toast';

// Token list for swap widget (example)
const TOKEN_LIST = [
  {
    defuseAssetId: 'zec',
    type: 'native' as const,
    symbol: 'ZEC',
    name: 'Zcash',
    decimals: 8,
    icon: 'https://assets.defuse.org/zec.png',
    chainId: 'zcash',
    chainIcon: 'https://assets.defuse.org/zcash.png',
    chainName: 'zcash' as const,
    routes: [],
    bridge: 'poa' as const,
  },
  {
    defuseAssetId: 'usdc-ethereum',
    address: 'usdc.token.near',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    icon: 'https://assets.defuse.org/usdc.png',
    chainId: 'ethereum',
    chainIcon: 'https://assets.defuse.org/ethereum.png',
    chainName: 'eth' as const,
    routes: [],
    bridge: 'poa' as const,
  },
  // Add more tokens as needed
];

export const SwapPage: React.FC = () => {
  const { accountId, account } = useWallet();

  // Send NEAR transaction handler
  const handleSendTransaction = async (tx: any) => {
    if (!account) {
      toast.error('Please connect your wallet');
      return null;
    }

    try {
      const result = await account.signAndSendTransaction({
        receiverId: tx.receiverId,
        actions: tx.actions,
      });

      return { txHash: result.transaction.hash };
    } catch (error) {
      console.error('Transaction failed:', error);
      toast.error('Transaction failed');
      return null;
    }
  };

  // Sign message handler
  const handleSignMessage = async (params: any) => {
    // Implement signing based on wallet type
    // This varies by wallet implementation
    console.log('Sign message:', params);
    return null;
  };

  const handleSuccessSwap = (params: any) => {
    toast.success(
      `Swapped ${params.amountIn} ${params.tokenIn.symbol} ` +
      `to ${params.amountOut} ${params.tokenOut.symbol}`
    );
  };

  return (
    <Container maxWidth="md">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" gutterBottom>
          Swap Your ZEC
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Convert your Zcash to other assets on different blockchains using NEAR Intents.
        </Typography>

        <Paper sx={{ p: 2 }}>
          <SwapWidget
            tokenList={TOKEN_LIST}
            userAddress={accountId}
            userChainType={ChainType.Near}
            sendNearTransaction={handleSendTransaction}
            signMessage={handleSignMessage}
            onSuccessSwap={handleSuccessSwap}
            renderHostAppLink={(routeName, children, props) => (
              <a href={`/${routeName}`} {...props}>
                {children}
              </a>
            )}
            referral="near-private-payroll"
          />
        </Paper>
      </Box>
    </Container>
  );
};
```

### 5. Auto-Lend Configuration Component (`src/components/AutoLendDialog.tsx`)

```typescript
import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  Slider,
} from '@mui/material';
import { usePayrollContract } from '../hooks/usePayrollContract';
import { DestinationChain } from '@near-private-payroll/sdk';
import toast from 'react-hot-toast';

interface AutoLendDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AutoLendDialog: React.FC<AutoLendDialogProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const { payroll, accountId } = usePayrollContract();
  const [percentage, setPercentage] = useState<number>(30);
  const [protocol, setProtocol] = useState<string>('aave');
  const [chain, setChain] = useState<DestinationChain>(DestinationChain.Ethereum);
  const [asset, setAsset] = useState<string>('nep141:usdc.token.near');
  const [loading, setLoading] = useState(false);
  const [currentConfig, setCurrentConfig] = useState<any>(null);

  useEffect(() => {
    const loadConfig = async () => {
      if (!payroll || !accountId) return;
      try {
        const config = await payroll.getAutoLendConfig(accountId);
        setCurrentConfig(config);
        if (config && config.enabled) {
          setPercentage(config.percentage);
          setProtocol(config.target_protocol);
          setChain(config.target_chain);
          setAsset(config.target_asset);
        }
      } catch (error) {
        console.error('Failed to load config:', error);
      }
    };

    if (open) {
      loadConfig();
    }
  }, [open, payroll, accountId]);

  const handleEnable = async () => {
    if (!payroll) {
      toast.error('Wallet not connected');
      return;
    }

    try {
      setLoading(true);
      await payroll.enableAutoLend(percentage, protocol, chain, asset);
      toast.success(`Auto-lend enabled: ${percentage}% to ${protocol}`);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Failed to enable auto-lend:', error);
      toast.error(error.message || 'Failed to enable auto-lend');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    if (!payroll) return;

    try {
      setLoading(true);
      await payroll.disableAutoLend();
      toast.success('Auto-lend disabled');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Failed to disable auto-lend:', error);
      toast.error(error.message || 'Failed to disable auto-lend');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Configure Auto-Lend</DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2 }}>
          <Typography variant="body2" color="text.secondary" paragraph>
            Automatically lend a percentage of each salary payment to DeFi protocols
            to earn passive yield.
          </Typography>

          {currentConfig?.enabled && (
            <Typography variant="body2" color="success.main" sx={{ mb: 2 }}>
              Currently active: {currentConfig.percentage}% to {currentConfig.target_protocol}
            </Typography>
          )}

          <Box sx={{ mb: 3 }}>
            <Typography gutterBottom>
              Percentage: {percentage}%
            </Typography>
            <Slider
              value={percentage}
              onChange={(_, value) => setPercentage(value as number)}
              min={1}
              max={100}
              marks={[
                { value: 10, label: '10%' },
                { value: 25, label: '25%' },
                { value: 50, label: '50%' },
                { value: 75, label: '75%' },
                { value: 100, label: '100%' },
              ]}
            />
          </Box>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Protocol</InputLabel>
            <Select
              value={protocol}
              label="Protocol"
              onChange={(e) => setProtocol(e.target.value)}
            >
              <MenuItem value="aave">Aave (3-5% APY)</MenuItem>
              <MenuItem value="compound">Compound (2-4% APY)</MenuItem>
              <MenuItem value="solend">Solend (5-8% APY)</MenuItem>
            </Select>
          </FormControl>

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Chain</InputLabel>
            <Select
              value={chain}
              label="Chain"
              onChange={(e) => setChain(e.target.value as DestinationChain)}
            >
              <MenuItem value={DestinationChain.Ethereum}>Ethereum</MenuItem>
              <MenuItem value={DestinationChain.Solana}>Solana</MenuItem>
              <MenuItem value={DestinationChain.Near}>NEAR</MenuItem>
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Asset"
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
            helperText="NEP-141 token address (e.g., nep141:usdc.token.near)"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        {currentConfig?.enabled && (
          <Button onClick={handleDisable} disabled={loading} color="error">
            Disable Auto-Lend
          </Button>
        )}
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={handleEnable} disabled={loading} variant="contained">
          {currentConfig?.enabled ? 'Update' : 'Enable'} Auto-Lend
        </Button>
      </DialogActions>
    </Dialog>
  );
};
```

---

## Employee Dashboard

### 6. Complete Employee Dashboard (`src/pages/EmployeeDashboard.tsx`)

```typescript
import React, { useState } from 'react';
import {
  Container,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Box,
  Tabs,
  Tab,
} from '@mui/material';
import {
  AccountBalance,
  SwapHoriz,
  Savings,
  History,
} from '@mui/icons-material';
import { BalanceCard } from '../components/BalanceCard';
import { AutoLendDialog } from '../components/AutoLendDialog';
import { useNavigate } from 'react-router-dom';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
};

export const EmployeeDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [tabValue, setTabValue] = useState(0);
  const [autoLendOpen, setAutoLendOpen] = useState(false);

  const handleTabChange = (_: any, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Container maxWidth="lg">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" gutterBottom>
          Employee Dashboard
        </Typography>

        <Grid container spacing={3}>
          {/* Balance Card */}
          <Grid item xs={12}>
            <BalanceCard />
          </Grid>

          {/* Quick Actions */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <SwapHoriz color="primary" sx={{ fontSize: 40 }} />
                <Typography variant="h6" gutterBottom>
                  Swap Assets
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Convert ZEC to other assets on different blockchains
                </Typography>
                <Button
                  variant="contained"
                  fullWidth
                  onClick={() => navigate('/swap')}
                >
                  Swap Now
                </Button>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Savings color="primary" sx={{ fontSize: 40 }} />
                <Typography variant="h6" gutterBottom>
                  Auto-Lend
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Automatically earn yield on your salary
                </Typography>
                <Button
                  variant="contained"
                  fullWidth
                  onClick={() => setAutoLendOpen(true)}
                >
                  Configure
                </Button>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <AccountBalance color="primary" sx={{ fontSize: 40 }} />
                <Typography variant="h6" gutterBottom>
                  Withdraw
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Withdraw to NEAR wallet or cross-chain
                </Typography>
                <Button
                  variant="contained"
                  fullWidth
                  onClick={() => navigate('/withdraw')}
                >
                  Withdraw
                </Button>
              </CardContent>
            </Card>
          </Grid>

          {/* Tabs for History */}
          <Grid item xs={12}>
            <Card>
              <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={tabValue} onChange={handleTabChange}>
                  <Tab label="Payment History" />
                  <Tab label="Swap History" />
                  <Tab label="Lending History" />
                </Tabs>
              </Box>

              <TabPanel value={tabValue} index={0}>
                {/* Payment History Component */}
                <Typography>Payment history will be displayed here</Typography>
              </TabPanel>

              <TabPanel value={tabValue} index={1}>
                {/* Swap History Component */}
                <Typography>Swap history will be displayed here</Typography>
              </TabPanel>

              <TabPanel value={tabValue} index={2}>
                {/* Lending History Component */}
                <Typography>Lending history will be displayed here</Typography>
              </TabPanel>
            </Card>
          </Grid>
        </Grid>

        {/* Auto-Lend Dialog */}
        <AutoLendDialog
          open={autoLendOpen}
          onClose={() => setAutoLendOpen(false)}
          onSuccess={() => {
            // Refresh balances or show success message
          }}
        />
      </Box>
    </Container>
  );
};
```

---

## State Management

### 7. React Query Setup (`src/main.tsx`)

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster position="top-right" />
    </QueryClientProvider>
  </React.StrictMode>
);
```

---

## Deployment

### 8. Environment Configuration

**`public/config.json`:**
```json
{
  "NETWORK_ID": "mainnet",
  "CONTRACT_ID": "payroll.near",
  "INTENTS_CONTRACT": "intents.near",
  "POA_TOKEN": "zec.omft.near"
}
```

### 9. Build and Deploy

```bash
# Build for production
npm run build

# Deploy to Vercel
vercel --prod

# Or deploy to any static hosting
# Output is in ./dist
```

---

## Next Steps

1. **Implement remaining pages:**
   - Company dashboard with employee management
   - Payment form with ZK proof generation
   - Withdrawal page with cross-chain options

2. **Add error handling:**
   - Network errors
   - Transaction failures
   - Wallet disconnections

3. **Optimize performance:**
   - Lazy load components
   - Cache contract calls
   - Optimize re-renders

4. **Testing:**
   - Unit tests with Vitest
   - Integration tests
   - E2E tests with Playwright

---

**See Also:**
- [DeFi Features Guide](./DEFI_FEATURES_GUIDE.md)
- [Mainnet Deployment Guide](./MAINNET_DEPLOYMENT.md)
- [SDK Documentation](../sdk/README.md)

---

*Generated with Claude Code - December 2, 2025*
