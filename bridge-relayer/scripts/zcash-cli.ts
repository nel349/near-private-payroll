#!/usr/bin/env ts-node
/**
 * Zcash CLI - Helper tool for Zallet RPC operations
 *
 * Usage:
 *   npm run zcash-cli [--wallet=<name>] <command> [args]
 *
 * Wallets:
 *   --wallet=bridge   - Bridge custody wallet (port 28232, default)
 *   --wallet=user     - User test wallet (port 28233)
 *
 * Commands:
 *   accounts          - List all accounts
 *   addresses [uuid]  - Get addresses for account
 *   balance [uuid]    - Get balance for account
 *   sync              - Check sync status
 *   create-account    - Create new account
 */

import axios, { AxiosInstance } from 'axios';

// Wallet configurations
const WALLETS = {
  bridge: {
    port: 28232,
    user: 'zcashrpc',
    password: 'testpass123',
    name: 'Bridge Custody',
  },
  user: {
    port: 28233,
    user: 'userzcash',
    password: 'userpass123',
    name: 'User Test',
  },
};

type WalletType = keyof typeof WALLETS;

class ZcashCLI {
  private client: AxiosInstance;
  private walletName: string;

  constructor(wallet: WalletType = 'bridge') {
    const config = WALLETS[wallet];
    this.walletName = config.name;

    this.client = axios.create({
      baseURL: `http://127.0.0.1:${config.port}`,
      auth: {
        username: config.user,
        password: config.password,
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
        console.error(`   Expected: ${this.client.defaults.baseURL}`);
        process.exit(1);
      }
      throw error;
    }
  }

  async listAccounts(): Promise<void> {
    console.log(`📋 Listing accounts for ${this.walletName} wallet...\n`);

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

    if (accountUuid) {
      console.log(`⚠️  Note: Zallet's z_gettotalbalance shows total wallet balance (all accounts combined)`);
      console.log(`    Per-account balance is not available in current Zallet version.\n`);
    }

    // z_gettotalbalance params: minconf (default 1), include_watchonly (default false)
    const balance = await this.rpc<any>('z_gettotalbalance', [1, true]);

    console.log(`Transparent: ${balance.transparent} ZEC`);
    console.log(`Private (Shielded): ${balance.private} ZEC`);
    console.log(`Total: ${balance.total} ZEC\n`);

    if (parseFloat(balance.total) === 0) {
      console.log('💡 Wallet is empty. To receive testnet ZEC:');
      console.log('   1. Get an address: npm run zcash-cli generate-address');
      console.log('   2. Use a testnet faucet:');
      console.log('      - https://faucet.testnet.z.cash/');
      console.log('      - https://testnet.zecfaucet.com/');
    }
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

  async send(toAddress: string, amount: string, memo?: string): Promise<void> {
    console.log(`💸 Sending ${amount} ZEC to ${toAddress}...\n`);

    // Get first account
    const accounts = await this.rpc<any[]>('z_listaccounts');
    if (accounts.length === 0) {
      console.error('No accounts found. Create an account first.');
      return;
    }

    const account = accounts[0];

    // Get unspent outputs to find an address with balance (preferring Sapling over Orchard)
    const unspent = await this.rpc<any[]>('z_listunspent', [0, 9999999]);

    if (unspent.length === 0) {
      console.error('No funds available. Fund the wallet first.');
      return;
    }

    // Prefer Sapling addresses (Orchard doesn't work well in Zallet alpha)
    let utxo = unspent.find((u: any) => u.pool === 'sapling');
    if (!utxo) {
      // Fall back to any available
      utxo = unspent[0];
    }

    const fromAddress = utxo.address;
    console.log(`From account: ${account.account_uuid}`);
    console.log(`From address: ${fromAddress}`);
    console.log(`Pool: ${utxo.pool}`);
    console.log(`Available: ${utxo.value} ZEC\n`);

    // Prepare the send operation
    const recipients: any[] = [{
      address: toAddress,
      amount: parseFloat(amount),
    }];

    // Add memo if provided (format: company:<near_account_id>)
    if (memo) {
      const memoHex = Buffer.from(memo, 'utf8').toString('hex');
      recipients[0].memo = memoHex;
      console.log(`Memo: ${memo}`);
      console.log(`Memo (hex): ${memoHex}\n`);
    }

    // Send using z_sendmany
    // Note: fromAddress should be the shielded address, fee must be null (Zallet uses ZIP 317)
    try {
      const opid = await this.rpc<string>('z_sendmany', [
        fromAddress,  // Use address, not account UUID
        recipients,
        1, // minconf
        null // fee (must be null for Zallet)
      ]);

      console.log(`✅ Transaction submitted!`);
      console.log(`   Operation ID: ${opid}`);
      console.log(`\nTo check status:`);
      console.log(`   npm run zcash-cli${this.walletName !== 'Bridge Custody' ? ' -- --wallet=user' : ''} operation-status ${opid}`);
    } catch (error: any) {
      if (error.response && error.response.data) {
        console.error('\nDetailed error:', JSON.stringify(error.response.data, null, 2));
      }
      throw new Error(`Failed to send: ${error.message}`);
    }
  }

  async getOperationStatus(opid: string): Promise<void> {
    console.log(`🔍 Checking operation status...\n`);

    const result = await this.rpc<any[]>('z_getoperationstatus', [[opid]]);

    if (result.length === 0) {
      console.log('Operation not found.');
      return;
    }

    const op = result[0];
    console.log(`Status: ${op.status}`);
    console.log(`Method: ${op.method}`);

    if (op.status === 'success' && op.result) {
      console.log(`\n✅ Transaction successful!`);
      console.log(`   TxID: ${op.result.txid}`);
    } else if (op.status === 'failed') {
      console.log(`\n❌ Transaction failed:`);
      console.log(`   ${op.error?.message || 'Unknown error'}`);
    } else if (op.status === 'executing') {
      console.log(`\n⏳ Transaction is being processed...`);
    }
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
        case 'send':
          if (args.length < 2) {
            console.error('Usage: send <address> <amount> [memo]');
            process.exit(1);
          }
          await this.send(args[0], args[1], args[2]);
          break;
        case 'operation-status':
          if (args.length < 1) {
            console.error('Usage: operation-status <operation_id>');
            process.exit(1);
          }
          await this.getOperationStatus(args[0]);
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
  send <addr> <amt> [memo]  Send ZEC to address with optional memo
  operation-status <opid>   Check status of async operation
  sync                      Check Zebra sync status

Environment Variables:
  ZCASH_RPC_HOST        Zallet RPC host (default: 127.0.0.1)
  ZCASH_RPC_PORT        Zallet RPC port (default: 28232)
  ZCASH_RPC_USER        RPC username (default: zcashrpc)
  ZCASH_RPC_PASSWORD    RPC password (default: testpass123)
  ZEBRA_COOKIE          Zebra cookie for sync check
  SEED_FINGERPRINT      Seed fingerprint for create-account (if multiple seeds)

Examples:
  # Bridge wallet (default)
  npm run zcash-cli accounts
  npm run zcash-cli balance

  # User test wallet
  npm run zcash-cli --wallet=user accounts
  npm run zcash-cli --wallet=user create-account
  npm run zcash-cli --wallet=user addresses

  # With specific account
  npm run zcash-cli addresses 15e53ffa-f6e2-4d81-9c8f-6ab2144cdcfa
  npm run zcash-cli --wallet=user balance <uuid>

  # With specific seed
  SEED_FINGERPRINT=zip32seedfp... npm run zcash-cli --wallet=user create-account
`);
  }
}

// Main
const argv = process.argv.slice(2);

// Parse --wallet flag
let wallet: WalletType = 'bridge';
let remainingArgs = argv;

const walletFlagIndex = argv.findIndex(arg => arg.startsWith('--wallet='));
if (walletFlagIndex !== -1) {
  const walletArg = argv[walletFlagIndex].split('=')[1];
  if (walletArg === 'user' || walletArg === 'bridge') {
    wallet = walletArg as WalletType;
  } else {
    console.error(`Invalid wallet: ${walletArg}. Must be 'bridge' or 'user'`);
    process.exit(1);
  }
  remainingArgs = [...argv.slice(0, walletFlagIndex), ...argv.slice(walletFlagIndex + 1)];
}

const cli = new ZcashCLI(wallet);
const [command, ...args] = remainingArgs;

if (!command) {
  cli['showUsage']();
  process.exit(0);
}

cli.run(command, args);
