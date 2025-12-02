/**
 * Bridge Relayer - Main Orchestrator
 */

import { RelayerConfig, DepositEvent, WithdrawalEvent } from './types';
import { ZcashService } from './services/zcash.service';
import { ZcashdService } from './services/zcashd.service';
import { NearService } from './services/near.service';
import { StateService } from './services/state.service';

export class BridgeRelayer {
  private zcash: ZcashService;
  private zcashd?: ZcashdService; // Optional - for withdrawals
  private near: NearService;
  private state: StateService;
  private pollInterval: number;
  private isRunning: boolean = false;
  private pollTimer?: NodeJS.Timeout;
  private withdrawalPollTimer?: NodeJS.Timeout;

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

    // Initialize zcashd for withdrawals (optional)
    if (config.zcashd && config.zcashd.enabled) {
      this.zcashd = new ZcashdService(
        config.zcashd.rpcHost,
        config.zcashd.rpcPort,
        config.zcashd.rpcUser,
        config.zcashd.rpcPassword
      );
    }

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

    // Test zcashd connection if enabled
    if (this.zcashd) {
      console.log('\nTesting zcashd connection (for withdrawals)...');
      try {
        const info = await this.zcashd.testConnection();
        const balance = await this.zcashd.getTotalBalance();
        const custodyAddr = await this.zcashd.getCustodyAddress();

        console.log('  ✅ Connected to zcashd');
        console.log(`  Version: ${info.version}`);
        console.log(`  Blocks: ${info.blocks}`);
        console.log(`  Balance: ${balance} ZEC`);
        console.log(`  Custody Address: ${custodyAddr.substring(0, 30)}...`);
      } catch (error: any) {
        console.error('  ❌ zcashd connection failed:', error.message);
        console.error('\nWithdrawals will not work until zcashd is running and synced');
        console.error('  Check configuration and make sure zcashd is running');
        // Don't throw - withdrawals are optional
      }
    } else {
      console.log('\nzcashd not configured - withdrawals disabled');
    }

    console.log('\nConfiguration:');
    console.log('  wZEC Contract:', this.config.near.wzecContract);
    console.log('  Intents Adapter:', this.config.near.intentsAdapter);
    console.log('  Poll Interval:', this.pollInterval / 1000, 'seconds');
    if (this.zcashd) {
      const withdrawalInterval = this.config.withdrawalPollInterval || this.pollInterval;
      console.log('  Withdrawal Poll Interval:', withdrawalInterval / 1000, 'seconds');
    }
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

    // Initial deposit check
    await this.monitorDeposits();

    // Start deposit polling loop
    this.pollTimer = setInterval(async () => {
      await this.monitorDeposits();
    }, this.pollInterval);

    // Start withdrawal monitoring if zcashd is enabled
    if (this.zcashd) {
      console.log('🔄 Starting withdrawal monitoring...\n');

      // Initial withdrawal check
      await this.monitorWithdrawals();

      // Start withdrawal polling loop
      const withdrawalInterval = this.config.withdrawalPollInterval || this.pollInterval;
      this.withdrawalPollTimer = setInterval(async () => {
        await this.monitorWithdrawals();
      }, withdrawalInterval);
    }
  }

  /**
   * Stop the relayer
   */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    if (this.withdrawalPollTimer) {
      clearInterval(this.withdrawalPollTimer);
      this.withdrawalPollTimer = undefined;
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

  /**
   * Monitor for new withdrawal requests (burn events)
   */
  private async monitorWithdrawals(): Promise<void> {
    if (!this.zcashd) {
      return;
    }

    try {
      // Query NEAR for new burn events
      const withdrawals = await this.near.getNewWithdrawals(
        this.state.getProcessedWithdrawalNonces()
      );

      if (withdrawals.length > 0) {
        console.log(`🔥 Found ${withdrawals.length} new withdrawal(s)\n`);

        for (const withdrawal of withdrawals) {
          // Skip if already processed
          if (this.state.isWithdrawalProcessed(withdrawal.nonce)) {
            continue;
          }

          await this.processWithdrawal(withdrawal);
        }
      }
    } catch (error: any) {
      console.error('❌ Error monitoring withdrawals:', error.message);
    }
  }

  /**
   * Process a single withdrawal request
   */
  private async processWithdrawal(withdrawal: WithdrawalEvent): Promise<void> {
    if (!this.zcashd) {
      console.error('❌ Cannot process withdrawal: zcashd not available');
      return;
    }

    console.log('🔥 New withdrawal detected!');
    console.log(`  Burner: ${withdrawal.burner}`);
    console.log(`  Amount: ${withdrawal.amount} wZEC`);
    console.log(`  Destination: ${withdrawal.zcash_shielded_address}`);
    console.log(`  Nonce: ${withdrawal.nonce}`);
    console.log(`  NEAR Tx: ${withdrawal.nearTxHash}`);

    try {
      // Convert wZEC amount (8 decimals) to ZEC decimal
      const amount = parseFloat(withdrawal.amount) / 100000000;

      // Get custody address
      const fromAddress = await this.zcashd.getCustodyAddress();

      // Send ZEC to destination
      console.log(`  Sending ${amount} ZEC to ${withdrawal.zcash_shielded_address.substring(0, 20)}...`);

      const opid = await this.zcashd.sendZec(
        fromAddress,
        withdrawal.zcash_shielded_address,
        amount
      );

      console.log(`  Operation ID: ${opid}`);
      console.log(`  Waiting for transaction to complete...`);

      // Wait for operation to complete
      const txid = await this.zcashd.waitForOperation(opid);

      console.log(`  ✅ ZEC sent successfully!`);
      console.log(`  Zcash Txid: ${txid}\n`);

      // Mark as processed
      this.state.markWithdrawalProcessed(withdrawal.nonce);
    } catch (error: any) {
      console.error(`  ❌ Withdrawal failed: ${error.message}\n`);
    }
  }
}
