'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Wallet, X } from 'lucide-react';

interface FundAccountDialogProps {
  companyId: string;
  onSuccess?: (amount: number, txid: string) => void;
  onClose?: () => void;
}

export function FundAccountDialog({ companyId, onSuccess, onClose }: FundAccountDialogProps) {
  const [fundAmount, setFundAmount] = useState('0.01');
  const [token] = useState('ZEC');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ amount: number; txid: string } | null>(null);

  const handleFundAccount = async () => {
    setIsProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      const amount = parseFloat(fundAmount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Please enter a valid amount');
      }

      console.log('[FundAccount] Initiating bridge deposit:', fundAmount, 'ZEC');
      console.log('[FundAccount] Flow: ZEC → Bridge Custody → wZEC Mint → Payroll Contract');

      // fundAmount is already in ZEC, just validate and format
      const zecAmount = parseFloat(fundAmount).toFixed(8);

      // Step 1: Send ZEC to bridge (simulated via API)
      console.log('[FundAccount] Step 1: Sending ZEC to bridge custody...');
      const bridgeResponse = await fetch('/api/bridge/simulate-deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: zecAmount,
          companyId: companyId,
        }),
      });

      if (!bridgeResponse.ok) {
        const errorData = await bridgeResponse.json();
        throw new Error(errorData.error || 'Bridge deposit failed');
      }

      const bridgeResult = await bridgeResponse.json();
      console.log('[FundAccount]   ✓ ZEC sent to bridge:', bridgeResult.txid);
      console.log('[FundAccount]   Bridge-relayer will mint wZEC and deposit to contract');

      // Step 2: Wait for bridge-relayer to process
      console.log('[FundAccount] Step 2: Waiting for bridge-relayer to process...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      console.log('[FundAccount] ✅ Bridge deposit initiated!');
      console.log('[FundAccount] Check bridge-relayer logs to confirm wZEC minting');

      setSuccess({ amount: parseFloat(fundAmount), txid: bridgeResult.txid });

      if (onSuccess) {
        onSuccess(parseFloat(fundAmount), bridgeResult.txid);
      }
    } catch (err) {
      console.error('[FundAccount] Error funding account:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to fund account';

      // Provide helpful error messages
      if (errorMessage.includes('Zcash wallet not running') || errorMessage.includes('Zallet')) {
        setError('Zcash wallet (Zallet) is not running. Please start it first.');
      } else if (errorMessage.toLowerCase().includes('insufficient')) {
        setError('Insufficient ZEC balance in wallet. Mine some test ZEC first.');
      } else if (errorMessage.includes('Bridge deposit failed')) {
        setError('Bridge service unavailable. Please try again later.');
      } else if (errorMessage.includes('funds available')) {
        setError('No ZEC funds in wallet. Run: zcash-cli generate 101');
      } else {
        setError(`Deposit failed: ${errorMessage}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Fund Payroll Account</CardTitle>
            <CardDescription>
              Deposit ZEC to bridge and mint wZEC for payroll
            </CardDescription>
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isProcessing}
              className="h-8 w-8 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Info Box */}
          <div className="p-4 rounded-lg border border-blue-500/20 bg-blue-500/5">
            <p className="text-sm mb-2">
              🔒 <span className="font-semibold">Privacy-Preserving Bridge</span>
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold">Bridge Flow:</span> ZEC sent to custody → Bridge-relayer detects → Mints wZEC on NEAR → Deposits to your payroll contract
            </p>
          </div>

          {/* Success Message */}
          {success && (
            <div className="p-4 rounded-lg border border-green-500/20 bg-green-500/10 text-green-500 text-sm">
              <p className="font-semibold mb-1">✅ Deposit Initiated!</p>
              <p className="text-xs">
                {success.amount} ZEC sent to bridge. Bridge-relayer will process shortly.
              </p>
              <p className="text-xs font-mono mt-1 break-all">
                TX: {success.txid.substring(0, 16)}...
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-4 rounded-lg border border-red-500/20 bg-red-500/10 text-red-500 text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Amount (ZEC)</label>
              <input
                type="number"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background"
                disabled={isProcessing || !!success}
                step="0.001"
                min="0.001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Token</label>
              <input
                type="text"
                value={token}
                className="w-full px-3 py-2 rounded-lg border border-border bg-muted/50"
                disabled
              />
              <p className="text-xs text-muted-foreground mt-1">
                Bridges to wZEC on NEAR
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            {onClose && (
              <Button
                variant="outline"
                className="flex-1"
                onClick={onClose}
                disabled={isProcessing}
              >
                Cancel
              </Button>
            )}
            <Button
              className="flex-1"
              onClick={handleFundAccount}
              disabled={isProcessing || !!success}
            >
              {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {isProcessing ? 'Processing...' : success ? 'Deposited!' : 'Deposit Now'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
