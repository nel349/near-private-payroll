/**
 * Contract deployment using wallet selector
 */

import { transactions } from 'near-api-js';
import type { WalletSelector } from '@near-wallet-selector/core';
import { CONFIG } from '@/config/contracts';

/**
 * Deploy a payroll contract using wallet selector
 *
 * @param selector - Wallet selector instance
 * @param signedAccountId - The signed-in account ID
 * @param companyName - Company name for subaccount generation
 * @param wasmUrl - URL to WASM file
 * @param wzecToken - wZEC token contract address
 * @param zkVerifier - ZK verifier contract address
 * @returns Deployed contract address
 */
export async function deployPayrollContract(
  selector: WalletSelector,
  signedAccountId: string,
  companyName: string,
  wasmUrl: string,
  wzecToken: string,
  zkVerifier: string
): Promise<string> {
  // Generate subaccount name from company name + timestamp
  const sanitizedName = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 20);

  const timestamp = Date.now();
  const subaccountId = `${sanitizedName}-${timestamp}.${signedAccountId}`;

  console.log(`[DeployContract] Deploying contract to: ${subaccountId}`);

  // Fetch WASM file
  console.log(`[DeployContract] Fetching WASM from: ${wasmUrl}`);
  const response = await fetch(wasmUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch WASM file: ${response.statusText}`);
  }
  const wasmBytes = new Uint8Array(await response.arrayBuffer());
  console.log(`[DeployContract] WASM loaded: ${wasmBytes.length} bytes`);

  // Initial balance for the subaccount (5 NEAR for storage)
  const initialBalance = '5000000000000000000000000'; // 5 NEAR in yoctoNEAR

  // Create actions for deployment
  const actions = [
    transactions.createAccount(),
    transactions.transfer(BigInt(initialBalance)),
    transactions.deployContract(wasmBytes),
    transactions.functionCall(
      'new',
      {
        owner: signedAccountId,
        wzec_token: wzecToken,
        zk_verifier: zkVerifier,
      },
      BigInt('300000000000000'), // 300 TGas
      BigInt('0')
    ),
  ];

  console.log(`[DeployContract] Signing transaction with wallet...`);

  // Get the wallet
  const wallet = await selector.wallet();

  // Sign and send transaction using wallet selector
  await wallet.signAndSendTransactions({
    transactions: [
      {
        receiverId: subaccountId,
        actions,
      },
    ],
  });

  console.log(`[DeployContract] Contract deployed and initialized successfully`);
  console.log(`[DeployContract] Contract address: ${subaccountId}`);

  return subaccountId;
}
