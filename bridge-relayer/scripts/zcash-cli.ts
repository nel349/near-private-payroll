#!/usr/bin/env ts-node
/**
 * Zcash CLI - Helper tool for Zallet RPC operations
 *
 * Usage:
 *   npm run zcash-cli <command> [args]
 *
 * Commands:
 *   accounts          - List all accounts
 *   addresses [uuid]  - Get addresses for account
 *   balance [uuid]    - Get balance for account
 *   sync              - Check sync status
 *   create-account    - Create new account
 */

import axios, { AxiosInstance } from 'axios';

const ZALLET_RPC_HOST = process.env.ZCASH_RPC_HOST || '127.0.0.1';
const ZALLET_RPC_PORT = parseInt(process.env.ZCASH_RPC_PORT || '28232');
const ZALLET_RPC_USER = process.env.ZCASH_RPC_USER || 'zcashrpc';
const ZALLET_RPC_PASSWORD = process.env.ZCASH_RPC_PASSWORD || 'testpass123';

class ZcashCLI {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `http://${ZALLET_RPC_HOST}:${ZALLET_RPC_PORT}`,
      auth: {
        username: ZALLET_RPC_USER,
        password: ZALLET_RPC_PASSWORD,
      },
      headers: {
        'content-type': 'text/plain;',
      },
    });
  }

  private async rpc<T>(method: string, params: any[] = []): Promise<T> {
    try {
      const response = await this.client.post('/', {
        jsonrpc: '1.0',
        id: Date.now().toString(),
        method,
        params,
      });

      if (response.data.error) {
        throw new Error(`RPC error: ${response.data.error.message}`);
      }

      return response.data.result;
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        console.error('❌ Cannot connect to Zallet RPC');
        console.error('   Make sure Zallet is running and RPC is enabled');
        console.error(`   Expected: http://${ZALLET_RPC_HOST}:${ZALLET_RPC_PORT}`);
        process.exit(1);
      }
      throw error;
    }
  }

  async listAccounts(): Promise<void> {
    console.log('📋 Listing Zallet accounts...\n');

    const accounts = await this.rpc<any[]>('z_listaccounts');

    if (accounts.length === 0) {
      console.log('No accounts found.');
      console.log('\nTo create an account, run:');
      console.log('  npm run zcash-cli create-account');
      return;
    }

    accounts.forEach((account, i) => {
      console.log(`Account ${i + 1}:`);
      console.log(`  UUID: ${account.account_uuid}`);
      console.log(`  Has spending key: ${account.has_spending_key ? '✅' : '❌'}`);
      console.log();
    });
  }

  async getAddresses(accountUuid?: string): Promise<void> {
    console.log('📍 Listing all addresses...\n');

    // Use listaddresses RPC method which returns full address strings
    const response = await this.rpc<any[]>('listaddresses');

    if (!response || response.length === 0) {
      console.log('No addresses found. Create an account first:');
      console.log('  npm run zcash-cli create-account');
      return;
    }

    // Extract unified addresses from mnemonic_seed source
    const mnemonicSource = response.find(src => src.source === 'mnemonic_seed');
    if (!mnemonicSource || !mnemonicSource.unified) {
      console.log('No mnemonic-based addresses found.');
      return;
    }

    // Get z_listaccounts to map account indexes to UUIDs
    const accounts = await this.rpc<any[]>('z_listaccounts');
    const accountMap = new Map(accounts.map((acc, idx) => [idx, acc.account_uuid]));

    // Filter by account UUID if specified
    let accountsToShow = mnemonicSource.unified;
    if (accountUuid) {
      accountsToShow = mnemonicSource.unified.filter((acc: any) => {
        const uuid = accountMap.get(acc.account);
        return uuid === accountUuid;
      });

      if (accountsToShow.length === 0) {
        console.error(`Account ${accountUuid} not found`);
        return;
      }
    }

    // Display addresses for each account
    for (const account of accountsToShow) {
      const uuid = accountMap.get(account.account) || 'Unknown';
      console.log(`Account ${account.account} (UUID: ${uuid})`);
      console.log(`Seed: ${account.seedfp.substring(0, 20)}...`);
      console.log(`Addresses (${account.addresses.length}):\n`);

      account.addresses.forEach((addr: any, i: number) => {
        console.log(`  ${i + 1}. ${addr.address}`);
        console.log(`     Diversifier index: ${addr.diversifier_index}`);
        console.log(`     Receiver types: ${addr.receiver_types.join(', ')}`);
        console.log();
      });
    }
  }

  async getBalance(accountUuid?: string): Promise<void> {
    console.log('💰 Getting balance...\n');

    const accounts = await this.rpc<any[]>('z_listaccounts');

    if (accounts.length === 0) {
      console.log('No accounts found.');
      return;
    }

    const account = accountUuid
      ? accounts.find(a => a.account_uuid === accountUuid)
      : accounts[0];

    if (!account) {
      console.error(`Account ${accountUuid} not found`);
      return;
    }

    console.log(`Account: ${account.account_uuid}\n`);

    const balance = await this.rpc<any>('z_getbalanceforaccount', [account.account_uuid]);

    console.log(`Balance: ${balance.balance / 100000000} ZEC`);
    console.log(`Unconfirmed: ${balance.unconfirmed_balance / 100000000} ZEC`);
  }

  async checkSync(): Promise<void> {
    console.log('🔄 Checking Zebra sync status...\n');

    // Connect to Zebra (different port and auth)
    const zebraClient = axios.create({
      baseURL: 'http://127.0.0.1:18232',
      auth: {
        username: '__cookie__',
        password: process.env.ZEBRA_COOKIE || '',
      },
      headers: {
        'content-type': 'application/json',
      },
    });

    try {
      const response = await zebraClient.post('/', {
        jsonrpc: '1.0',
        id: '1',
        method: 'getblockchaininfo',
        params: [],
      });

      const result = response.data.result;
      const syncPct = Math.floor(result.verificationprogress * 100);

      console.log(`Chain: ${result.chain}`);
      console.log(`Blocks: ${result.blocks.toLocaleString()}`);
      console.log(`Sync: ${syncPct}%`);

      if (syncPct < 90) {
        console.log('\n⚠️  Zebra not fully synced. Zallet RPC may not be available yet.');
      } else {
        console.log('\n✅ Zebra fully synced');
      }
    } catch (error) {
      console.error('Cannot connect to Zebra RPC (port 18232)');
    }
  }

  async createAccount(): Promise<void> {
    console.log('🔨 Creating new account...\n');

    try {
      // First, check if we need a seed fingerprint
      // If wallet has multiple seeds, we need to specify which one
      // For simplicity, we'll assume a fresh wallet with one seed

      const seedFingerprint = process.env.SEED_FINGERPRINT;
      const params = seedFingerprint ? [seedFingerprint] : [];

      console.log('Note: If you get an error about multiple seeds, provide SEED_FINGERPRINT env var\n');

      // Create account using RPC
      const result = await this.rpc<{ account_uuid: string }>('z_getnewaccount', params);

      console.log(`✅ Account created!`);
      console.log(`   UUID: ${result.account_uuid}\n`);

      // Now get an address for this account
      console.log('Generating first address...');
      const address = await this.rpc<{ address: string; receiver_types: string[] }>(
        'z_getaddressforaccount',
        [result.account_uuid, ['sapling']]
      );

      console.log(`✅ Address generated!`);
      console.log(`   ${address.address}`);
      console.log(`   Types: ${address.receiver_types.join(', ')}\n`);

      console.log('💡 Save this address to receive testnet ZEC from faucets.');
    } catch (error: any) {
      if (error.message.includes('No seeds found') || error.message.includes('more than one seed')) {
        console.error('❌ Issue with wallet seeds.');
        console.error('\nTo create account with specific seed:');
        console.error('  SEED_FINGERPRINT=zip32seedfp... npm run zcash-cli create-account');
        console.error('\nTo start fresh:');
        console.error('  pkill -f zallet');
        console.error('  rm ~/.zallet/wallet.db');
        console.error('  /Users/norman/Development/NEAR/zallet/target/release/zallet -d ~/.zallet init-wallet-encryption');
        console.error('  /Users/norman/Development/NEAR/zallet/target/release/zallet -d ~/.zallet generate-mnemonic');
      } else {
        throw error;
      }
    }
  }

  async generateAddress(accountUuid?: string): Promise<void> {
    console.log('📍 Generating new address...\n');

    const accounts = await this.rpc<any[]>('z_listaccounts');

    if (accounts.length === 0) {
      console.log('No accounts found. Create an account first:');
      console.log('  npm run zcash-cli create-account');
      return;
    }

    const account = accountUuid
      ? accounts.find(a => a.account_uuid === accountUuid)
      : accounts[0];

    if (!account) {
      console.error(`Account ${accountUuid} not found`);
      return;
    }

    console.log(`Account: ${account.account_uuid}\n`);

    // Generate a new Sapling address
    const address = await this.rpc<{ address: string; receiver_types: string[] }>(
      'z_getaddressforaccount',
      [account.account_uuid, ['sapling']]
    );

    console.log(`✅ New address generated!`);
    console.log(`   ${address.address}`);
    console.log(`   Types: ${address.receiver_types.join(', ')}\n`);
  }

  async run(command: string, args: string[]): Promise<void> {
    try {
      switch (command) {
        case 'accounts':
          await this.listAccounts();
          break;
        case 'addresses':
          await this.getAddresses(args[0]);
          break;
        case 'generate-address':
          await this.generateAddress(args[0]);
          break;
        case 'balance':
          await this.getBalance(args[0]);
          break;
        case 'sync':
          await this.checkSync();
          break;
        case 'create-account':
          await this.createAccount();
          break;
        default:
          this.showUsage();
      }
    } catch (error: any) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }

  private showUsage(): void {
    console.log(`
Zcash CLI - Helper tool for Zallet RPC operations

Usage:
  npm run zcash-cli <command> [args]

Commands:
  accounts                  List all accounts
  addresses [uuid]          List addresses for account (default: all accounts)
  create-account            Create new account (generates first address too)
  generate-address [uuid]   Generate new address for account (default: first)
  balance [uuid]            Get balance for account (default: first account)
  sync                      Check Zebra sync status

Environment Variables:
  ZCASH_RPC_HOST        Zallet RPC host (default: 127.0.0.1)
  ZCASH_RPC_PORT        Zallet RPC port (default: 28232)
  ZCASH_RPC_USER        RPC username (default: zcashrpc)
  ZCASH_RPC_PASSWORD    RPC password (default: testpass123)
  ZEBRA_COOKIE          Zebra cookie for sync check
  SEED_FINGERPRINT      Seed fingerprint for create-account (if multiple seeds)

Examples:
  npm run zcash-cli accounts
  npm run zcash-cli addresses
  npm run zcash-cli create-account
  npm run zcash-cli generate-address
  npm run zcash-cli balance
  npm run zcash-cli sync

  # With specific account
  npm run zcash-cli addresses 15e53ffa-f6e2-4d81-9c8f-6ab2144cdcfa
  npm run zcash-cli balance 15e53ffa-f6e2-4d81-9c8f-6ab2144cdcfa

  # With specific seed
  SEED_FINGERPRINT=zip32seedfp... npm run zcash-cli create-account
`);
  }
}

// Main
const cli = new ZcashCLI();
const [command, ...args] = process.argv.slice(2);

if (!command) {
  cli['showUsage']();
  process.exit(0);
}

cli.run(command, args);
