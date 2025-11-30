/**
 * Bridge Relayer - Main Orchestrator
 */

import { RelayerConfig, DepositEvent } from './types';
import { ZcashService } from './services/zcash.service';
import { NearService } from './services/near.service';
import { StateService } from './services/state.service';

export class BridgeRelayer {
  private zcash: ZcashService;
  private near: NearService;
  private state: StateService;
  private pollInterval: number;
  private isRunning: boolean = false;
  private pollTimer?: NodeJS.Timeout;

  constructor(private config: RelayerConfig) {
    this.pollInterval = config.pollInterval;

    // Initialize services
    this.zcash = new ZcashService(
      config.zcash.rpcHost,
      config.zcash.rpcPort,
      config.zcash.rpcUser,
      config.zcash.rpcPassword,
      config.zcash.custodyAccountUuid
    );

    this.near = new NearService(
      config.near.network,
      config.near.relayerAccount,
      config.near.wzecContract,
      config.near.intentsAdapter
    );

    this.state = new StateService();
  }

  /**
   * Initialize and test all connections
   */
  async initialize(): Promise<void> {
    console.log('🌉 Zcash → NEAR Bridge Relayer');
    console.log('================================\n');

    // Load previous state
    this.state.load();

    // Test Zcash connection
    console.log('Testing Zcash RPC connection...');
    try {
      const info = await this.zcash.testConnection();
      console.log('  ✅ Connected to Zcash testnet');
      console.log(`  Block height: ${info.blocks}`);
      console.log(`  Chain: ${info.chain}`);
      console.log(`  Sync progress: ${(info.verificationprogress * 100).toFixed(2)}%`);

      // Initialize last processed block if not set
      if (this.state.get().lastProcessedBlock === 0) {
        this.state.setLastProcessedBlock(info.blocks);
      }
    } catch (error: any) {
      console.error('  ❌ Zcash connection failed:', error.message);
      console.error('\nMake sure Zallet is running with RPC enabled:');
      console.error('  Check ~/.zallet/zallet.toml has [rpc] configuration');
      throw error;
    }

    // Get custody account info
    try {
      const account = await this.zcash.getCustodyAccount();
      const balance = await this.zcash.getCustodyBalance();
      const addresses = await this.zcash.getCustodyAddresses();

      console.log(`\nCustody Account: ${account.account_uuid}`);
      console.log(`Custody Balance: ${balance} ZEC`);
      console.log(`Custody Addresses: ${addresses.length} addresses`);
      if (addresses.length > 0) {
        console.log(`  Primary: ${addresses[0]}`);
      }
    } catch (error: any) {
      console.error('Failed to get custody account info:', error.message);
    }

    // Connect to NEAR
    console.log('\nConnecting to NEAR', this.config.near.network, '...');
    try {
      await this.near.initialize();
      const info = await this.near.testConnection();
      console.log('  ✅ Connected as:', info.accountId);
      console.log('  Balance:', info.balance, 'NEAR');
    } catch (error: any) {
      console.error('  ❌ NEAR connection failed:', error.message);
      console.error('\nMake sure you have credentials for:', this.config.near.relayerAccount);
      console.error('  near login');
      throw error;
    }

    console.log('\nConfiguration:');
    console.log('  wZEC Contract:', this.config.near.wzecContract);
    console.log('  Intents Adapter:', this.config.near.intentsAdapter);
    console.log('  Poll Interval:', this.pollInterval / 1000, 'seconds');
    console.log();
  }

  /**
   * Start the relayer monitoring loop
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Relayer is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Relayer started! Monitoring for deposits...\n');

    // Initial check
    await this.monitorDeposits();

    // Start polling loop
    this.pollTimer = setInterval(async () => {
      await this.monitorDeposits();
    }, this.pollInterval);
  }

  /**
   * Stop the relayer
   */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    this.isRunning = false;
    this.state.save();
    console.log('\n✅ Relayer stopped');
  }

  /**
   * Monitor for new Zcash deposits
   */
  private async monitorDeposits(): Promise<void> {
    try {
      const currentBlock = await this.zcash.getCurrentBlock();
      const lastProcessed = this.state.get().lastProcessedBlock;

      if (currentBlock > lastProcessed) {
        console.log(`📦 New Zcash blocks: ${lastProcessed} → ${currentBlock}`);

        // Get new deposits
        const deposits = await this.zcash.getNewDeposits(
          1, // minConfirmations
          this.state.getProcessedTxids()
        );

        if (deposits.length > 0) {
          console.log(`Found ${deposits.length} new deposit(s)\n`);

          for (const deposit of deposits) {
            await this.processDeposit(deposit);
          }
        }

        // Update last processed block
        this.state.setLastProcessedBlock(currentBlock);
      }
    } catch (error: any) {
      console.error('❌ Error monitoring deposits:', error.message);
    }
  }

  /**
   * Process a single deposit
   */
  private async processDeposit(deposit: DepositEvent): Promise<void> {
    console.log('🔔 New deposit detected!');
    console.log(`  Txid: ${deposit.txid}`);
    console.log(`  Amount: ${deposit.amount} ZEC (${deposit.amountZat} zatoshis)`);
    console.log(`  Memo: ${deposit.memo || '(none)'}`);
    console.log(`  Company ID: ${deposit.companyId || '(none)'}`);
    console.log(`  Receiver: ${deposit.receiverId}`);
    console.log(`  Confirmations: ${deposit.confirmations}`);

    try {
      await this.near.mintForDeposit(deposit);

      console.log(`  ✅ Minted successfully!\n`);

      // Mark as processed
      this.state.markTxProcessed(deposit.txid);
    } catch (error: any) {
      console.error(`  ❌ Minting failed: ${error.message}\n`);
    }
  }
}
