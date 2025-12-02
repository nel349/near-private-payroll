#!/usr/bin/env ts-node

import axios, { AxiosInstance } from 'axios';

const ZCASHD_CONFIG = {
  host: process.env.ZCASHD_RPC_HOST || '127.0.0.1',
  port: parseInt(process.env.ZCASHD_RPC_PORT || '8233'),
  user: process.env.ZCASHD_RPC_USER || 'zcashuser',
  password: process.env.ZCASHD_RPC_PASSWORD || 'zcashpass123',
};

class ZcashdCLI {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `http://${ZCASHD_CONFIG.host}:${ZCASHD_CONFIG.port}`,
      auth: {
        username: ZCASHD_CONFIG.user,
        password: ZCASHD_CONFIG.password,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  private async rpc<T>(method: string, params: any[] = []): Promise<T> {
    try {
      const response = await this.client.post('', {
        jsonrpc: '1.0',
        id: 'zcashd-cli',
        method,
        params,
      });

      if (response.data.error) {
        throw new Error(`RPC Error: ${JSON.stringify(response.data.error)}`);
      }

      return response.data.result;
    } catch (error: any) {
      if (error.response?.data?.error) {
        console.error('\\nRPC Error:', JSON.stringify(error.response.data.error, null, 2));
      }
      throw error;
    }
  }

  async getInfo(): Promise<void> {
    console.log('\\n📊 Zcashd Info:\\n');
    const info = await this.rpc<any>('getinfo');
    console.log(`Version: ${info.version}`);
    console.log(`Blocks: ${info.blocks}`);
    console.log(`Connections: ${info.connections}`);
    console.log(`\\n`);
  }

  async listAddresses(): Promise<void> {
    console.log('\\n📍 Zcashd Addresses:\\n');
    const addresses = await this.rpc<string[]>('z_listaddresses');

    if (addresses.length === 0) {
      console.log('No addresses found. Create one with: npm run zcashd-cli new-address');
      return;
    }

    for (const addr of addresses) {
      console.log(`  ${addr}`);
    }
    console.log(`\\n`);
  }

  async newAddress(): Promise<void> {
    console.log('\\n🆕 Creating new Sapling address...\\n');
    const address = await this.rpc<string>('z_getnewaddress', ['sapling']);
    console.log(`Address: ${address}\\n`);
  }

  async balance(): Promise<void> {
    console.log('\\n💰 Getting balance...\\n');
    const balance = await this.rpc<any>('z_gettotalbalance');
    console.log(`Transparent: ${balance.transparent} ZEC`);
    console.log(`Private (Shielded): ${balance.private} ZEC`);
    console.log(`Total: ${balance.total} ZEC\\n`);
  }

  async send(toAddress: string, amount: string, fromAddress?: string, memo?: string): Promise<void> {
    console.log(`\\n💸 Sending ${amount} ZEC to ${toAddress}...\\n`);

    // If no from address specified, use the first shielded address with balance
    let from = fromAddress;
    if (!from) {
      const addresses = await this.rpc<string[]>('z_listaddresses');
      if (addresses.length === 0) {
        console.error('No addresses found. Create one first.');
        return;
      }
      from = addresses[0];
    }

    console.log(`From: ${from}`);

    // Prepare recipient
    const recipient: any = {
      address: toAddress,
      amount: parseFloat(amount),
    };

    // Add memo if provided (format: company:<near_account_id>)
    if (memo) {
      const memoHex = Buffer.from(memo, 'utf8').toString('hex');
      recipient.memo = memoHex;
      console.log(`Memo: ${memo}`);
      console.log(`Memo (hex): ${memoHex}`);
    }

    console.log('\\n');

    try {
      const opid = await this.rpc<string>('z_sendmany', [from, [recipient]]);
      console.log(`✅ Transaction submitted!`);
      console.log(`   Operation ID: ${opid}`);
      console.log(`\\nCheck status with: npm run zcashd-cli status ${opid}\\n`);
    } catch (error: any) {
      console.error(`\\nFailed to send: ${error.message}\\n`);
      throw error;
    }
  }

  async operationStatus(opid: string): Promise<void> {
    console.log(`\\n🔍 Checking operation ${opid}...\\n`);
    const result = await this.rpc<any[]>('z_getoperationstatus', [[opid]]);

    if (result.length === 0) {
      console.log('Operation not found.\\n');
      return;
    }

    const op = result[0];
    console.log(`Status: ${op.status}`);

    if (op.status === 'success') {
      console.log(`✅ Transaction ID: ${op.result.txid}\\n`);
    } else if (op.status === 'failed') {
      console.log(`❌ Error: ${op.error.message}\\n`);
    } else {
      console.log(`⏳ Operation still ${op.status}...\\n`);
    }
  }

  private showHelp(): void {
    console.log(`
Zcashd CLI - Helper tool for zcashd RPC operations

Usage:
  npm run zcashd-cli <command> [args]

Commands:
  info                          Show zcashd node info
  addresses                     List all shielded addresses
  new-address                   Create new Sapling address
  balance                       Get total balance
  send <addr> <amt> [from] [memo]  Send ZEC (memo format: company:account.testnet)
  status <opid>                 Check operation status

Environment Variables:
  ZCASHD_RPC_HOST        Zcashd RPC host (default: 127.0.0.1)
  ZCASHD_RPC_PORT        Zcashd RPC port (default: 8233)
  ZCASHD_RPC_USER        RPC username (default: zcashuser)
  ZCASHD_RPC_PASSWORD    RPC password (default: zcashpass123)

Examples:
  npm run zcashd-cli info
  npm run zcashd-cli addresses
  npm run zcashd-cli balance
  npm run zcashd-cli new-address
  npm run zcashd-cli send ztestXXX... 0.01
  npm run zcashd-cli send ztestXXX... 0.01 ztestYYY... "company:nel349.testnet"
  npm run zcashd-cli status opid-12345-abcde
`);
  }

  async run(): Promise<void> {
    const args = process.argv.slice(2);
    const command = args[0];

    try {
      switch (command) {
        case 'info':
          await this.getInfo();
          break;
        case 'addresses':
          await this.listAddresses();
          break;
        case 'new-address':
          await this.newAddress();
          break;
        case 'balance':
          await this.balance();
          break;
        case 'send':
          if (args.length < 3) {
            console.error('Usage: send <address> <amount> [from_address] [memo]');
            process.exit(1);
          }
          await this.send(args[1], args[2], args[3], args[4]);
          break;
        case 'status':
          if (args.length < 2) {
            console.error('Usage: status <operation_id>');
            process.exit(1);
          }
          await this.operationStatus(args[1]);
          break;
        default:
          this.showHelp();
          break;
      }
    } catch (error: any) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  }
}

// Run the CLI
new ZcashdCLI().run();
