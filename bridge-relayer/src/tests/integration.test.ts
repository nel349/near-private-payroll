/**
 * Integration Tests
 *
 * These tests check if Zallet is available and skip gracefully if not.
 * To run with Zallet: npm test
 */

import { ZcashService } from '../services/zcash.service';
import { StateService } from '../services/state.service';

describe('Integration Tests', () => {
  let zcash: ZcashService;
  let isZalletAvailable = false;

  beforeAll(async () => {
    zcash = new ZcashService(
      process.env.ZCASH_RPC_HOST || '127.0.0.1',
      parseInt(process.env.ZCASH_RPC_PORT || '28232'),
      process.env.ZCASH_RPC_USER || 'zcashrpc',
      process.env.ZCASH_RPC_PASSWORD || 'testpass123'
    );

    // Check if Zallet is available
    try {
      await zcash.testConnection();
      isZalletAvailable = true;
    } catch (error) {
      console.log('⏭️  Zallet RPC not available, skipping integration tests');
      isZalletAvailable = false;
    }
  }, 15000);

  describe('Zallet RPC Connection', () => {
    it('should connect to Zallet', async () => {
      if (!isZalletAvailable) {
        console.log('  Skipped (Zallet not available)');
        return;
      }

      const info = await zcash.testConnection();
      expect(info.chain).toBe('test');
      expect(typeof info.blocks).toBe('number');
      expect(typeof info.verificationprogress).toBe('number');
    }, 10000);

    it('should get custody account', async () => {
      if (!isZalletAvailable) {
        console.log('  Skipped (Zallet not available)');
        return;
      }

      const account = await zcash.getCustodyAccount();
      expect(account.account_uuid).toBeDefined();
      expect(typeof account.account_uuid).toBe('string');
      expect(typeof account.account).toBe('number');
    }, 10000);

    it('should get custody balance', async () => {
      if (!isZalletAvailable) {
        console.log('  Skipped (Zallet not available)');
        return;
      }

      const balance = await zcash.getCustodyBalance();
      expect(typeof balance).toBe('number');
      expect(balance).toBeGreaterThanOrEqual(0);
    }, 10000);

    it('should get custody addresses', async () => {
      if (!isZalletAvailable) {
        console.log('  Skipped (Zallet not available)');
        return;
      }

      const addresses = await zcash.getCustodyAddresses();
      expect(Array.isArray(addresses)).toBe(true);
      expect(addresses.length).toBeGreaterThan(0);

      // Testnet unified addresses start with "utest1"
      addresses.forEach((addr) => {
        expect(addr).toMatch(/^utest1/);
      });
    }, 10000);

    it('should get current block height', async () => {
      if (!isZalletAvailable) {
        console.log('  Skipped (Zallet not available)');
        return;
      }

      const height = await zcash.getCurrentBlock();
      expect(typeof height).toBe('number');
      expect(height).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Deposit Monitoring', () => {
    it('should query for deposits (may be empty)', async () => {
      if (!isZalletAvailable) {
        console.log('  Skipped (Zallet not available)');
        return;
      }

      const deposits = await zcash.getNewDeposits(1, []);
      expect(Array.isArray(deposits)).toBe(true);

      // If deposits exist, validate structure
      deposits.forEach((deposit) => {
        expect(deposit.txid).toBeDefined();
        expect(typeof deposit.amount).toBe('number');
        expect(typeof deposit.amountZat).toBe('number');
        expect(deposit.receiverId).toBeDefined();
      });
    }, 10000);
  });

  describe('State Management', () => {
    it('should persist and load state', () => {
      const state = new StateService();

      // Set some state
      state.setLastProcessedBlock(12345);
      state.markTxProcessed('test-tx-1');
      state.markTxProcessed('test-tx-2');

      // Load in new instance
      const state2 = new StateService();
      state2.load();

      const loadedState = state2.get();
      expect(loadedState.lastProcessedBlock).toBe(12345);
      expect(loadedState.processedTxids).toContain('test-tx-1');
      expect(loadedState.processedTxids).toContain('test-tx-2');
    });
  });
});

describe('Integration Test Info', () => {
  it('should show how to run integration tests', () => {
    console.log('\n=== Integration Test Instructions ===\n');
    console.log('These tests require Zallet RPC to be available.\n');
    console.log('To run integration tests:');
    console.log('  1. Ensure Zebra is synced (~90%+)');
    console.log('  2. Ensure Zallet is running with RPC enabled');
    console.log('  3. Set environment variables in .env');
    console.log('  4. Run: npm test\n');
    console.log('To skip integration tests:');
    console.log('  SKIP_INTEGRATION=true npm test\n');
    console.log('=====================================\n');

    expect(true).toBe(true);
  });
});
