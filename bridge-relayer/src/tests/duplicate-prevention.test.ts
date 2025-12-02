/**
 * Duplicate Prevention Tests
 *
 * Critical edge case: Ensure deposits/withdrawals aren't processed twice
 * even after relayer restarts or state reloads.
 */

import { StateService } from '../services/state.service';
import * as fs from 'fs';
import * as path from 'path';

describe('Duplicate Prevention Tests', () => {
  let stateService: StateService;
  let testStateFile: string;

  beforeEach(() => {
    // Create unique state file for each test to avoid interference
    testStateFile = path.join(__dirname, `test-state-${Date.now()}-${Math.random()}.json`);

    // Clean up if exists (shouldn't happen)
    if (fs.existsSync(testStateFile)) {
      fs.unlinkSync(testStateFile);
    }

    // Create a test state service pointing to unique test file
    stateService = new StateService(testStateFile);
  });

  afterEach(() => {
    // Clean up test state file
    if (fs.existsSync(testStateFile)) {
      fs.unlinkSync(testStateFile);
    }
  });

  describe('Deposit Duplicate Prevention', () => {
    it('should mark txid as processed after successful deposit', () => {
      const txid = 'test-txid-12345';

      // Initially not processed
      expect(stateService.isTxProcessed(txid)).toBe(false);

      // Mark as processed
      stateService.markTxProcessed(txid);

      // Now should be processed
      expect(stateService.isTxProcessed(txid)).toBe(true);
    });

    it('should persist processed txids across restarts', () => {
      const txid1 = 'test-txid-1';
      const txid2 = 'test-txid-2';

      // Mark txids as processed
      stateService.markTxProcessed(txid1);
      stateService.markTxProcessed(txid2);

      // Create new service instance with same file (simulates restart)
      const newStateService = new StateService(testStateFile);
      newStateService.load();

      // Should still be marked as processed
      expect(newStateService.isTxProcessed(txid1)).toBe(true);
      expect(newStateService.isTxProcessed(txid2)).toBe(true);
    });

    it('should filter out already processed deposits', () => {
      const processedTxids = ['txid1', 'txid2', 'txid3'];
      const allDeposits = [
        { txid: 'txid1', amount: 1 },
        { txid: 'txid2', amount: 2 },
        { txid: 'txid4', amount: 4 },  // New
        { txid: 'txid5', amount: 5 },  // New
      ];

      // Mark some as processed
      processedTxids.forEach(txid => stateService.markTxProcessed(txid));

      // Filter should only return unprocessed
      const newDeposits = allDeposits.filter(d => !stateService.isTxProcessed(d.txid));

      expect(newDeposits).toHaveLength(2);
      expect(newDeposits[0].txid).toBe('txid4');
      expect(newDeposits[1].txid).toBe('txid5');
    });

    it('should handle large number of processed txids', () => {
      // Test with 10,000 txids
      const txids = Array.from({ length: 10000 }, (_, i) => `txid-${i}`);

      // Mark all as processed
      txids.forEach(txid => stateService.markTxProcessed(txid));

      // All should be marked
      expect(stateService.getProcessedTxids()).toHaveLength(10000);

      // Random check should be fast (< 10ms)
      const start = Date.now();
      expect(stateService.isTxProcessed('txid-5000')).toBe(true);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(10);
    });
  });

  describe('Withdrawal Duplicate Prevention', () => {
    it('should mark nonce as processed after successful withdrawal', () => {
      const nonce = 5;

      // Initially not processed
      expect(stateService.isWithdrawalProcessed(nonce)).toBe(false);

      // Mark as processed
      stateService.markWithdrawalProcessed(nonce);

      // Now should be processed
      expect(stateService.isWithdrawalProcessed(nonce)).toBe(true);
    });

    it('should persist processed nonces across restarts', () => {
      const nonces = [1, 2, 3, 5, 7]; // Non-sequential is OK

      // Mark nonces as processed
      nonces.forEach(nonce => stateService.markWithdrawalProcessed(nonce));

      // Create new service instance with same file (simulates restart)
      const newStateService = new StateService(testStateFile);
      newStateService.load();

      // All should still be marked as processed
      nonces.forEach(nonce => {
        expect(newStateService.isWithdrawalProcessed(nonce)).toBe(true);
      });
    });

    it('should filter out already processed withdrawals', () => {
      const processedNonces = [1, 2, 3];
      const allWithdrawals = [
        { nonce: 1, amount: '100' },
        { nonce: 2, amount: '200' },
        { nonce: 4, amount: '400' },  // New
        { nonce: 5, amount: '500' },  // New
      ];

      // Mark some as processed
      processedNonces.forEach(nonce => stateService.markWithdrawalProcessed(nonce));

      // Filter should only return unprocessed
      const newWithdrawals = allWithdrawals.filter(
        w => !stateService.isWithdrawalProcessed(w.nonce)
      );

      expect(newWithdrawals).toHaveLength(2);
      expect(newWithdrawals[0].nonce).toBe(4);
      expect(newWithdrawals[1].nonce).toBe(5);
    });

    it('should handle gaps in nonce sequence', () => {
      // Process nonces: 1, 2, 4, 5 (3 is missing/failed)
      [1, 2, 4, 5].forEach(nonce => stateService.markWithdrawalProcessed(nonce));

      // If nonce 3 shows up later, should still process it
      expect(stateService.isWithdrawalProcessed(3)).toBe(false);

      // After processing nonce 3
      stateService.markWithdrawalProcessed(3);
      expect(stateService.isWithdrawalProcessed(3)).toBe(true);
    });

    it('should handle very large nonces', () => {
      const largeNonce = 999999999;

      stateService.markWithdrawalProcessed(largeNonce);
      expect(stateService.isWithdrawalProcessed(largeNonce)).toBe(true);

      // Reload with same file and verify
      const newStateService = new StateService(testStateFile);
      newStateService.load();
      expect(newStateService.isWithdrawalProcessed(largeNonce)).toBe(true);
    });
  });

  describe('State Corruption Recovery', () => {
    it('should handle corrupted state file gracefully', () => {
      // Write corrupted JSON to test file
      fs.writeFileSync(testStateFile, '{ corrupted json ]');

      // Should not throw, should start with fresh state
      const newStateService = new StateService(testStateFile);
      newStateService.load();

      expect(newStateService.getProcessedTxids()).toHaveLength(0);
      expect(newStateService.getProcessedWithdrawalNonces()).toHaveLength(0);
    });

    it('should handle missing state file gracefully', () => {
      // Create service with non-existent file
      const missingFile = path.join(__dirname, 'non-existent-state.json');

      // Should not throw, should start with fresh state
      const newStateService = new StateService(missingFile);
      newStateService.load();

      expect(newStateService.getProcessedTxids()).toHaveLength(0);
    });

    it('should handle state file with missing fields (backward compatibility)', () => {
      // Write old state format (missing processedWithdrawalNonces)
      const oldState = {
        lastProcessedBlock: 100,
        processedTxids: ['txid1', 'txid2'],
        // Missing: processedWithdrawalNonces, pendingWithdrawals
      };
      fs.writeFileSync(testStateFile, JSON.stringify(oldState));

      // Should load with defaults for missing fields
      const newStateService = new StateService(testStateFile);
      newStateService.load();

      const state = newStateService.get();
      expect(state.lastProcessedBlock).toBe(100);
      expect(state.processedTxids).toEqual(['txid1', 'txid2']);
      expect(state.processedWithdrawalNonces).toEqual([]);  // Default
      expect(state.pendingWithdrawals).toEqual([]);  // Default
    });
  });

  describe('Concurrent Access', () => {
    it('should handle rapid state updates without data loss', () => {
      // Simulate rapid updates from multiple "threads"
      const txids = Array.from({ length: 100 }, (_, i) => `rapid-txid-${i}`);

      // Mark all rapidly
      txids.forEach(txid => stateService.markTxProcessed(txid));

      // All should be saved
      const state = stateService.get();
      expect(state.processedTxids).toHaveLength(100);

      // All should be marked
      txids.forEach(txid => {
        expect(stateService.isTxProcessed(txid)).toBe(true);
      });
    });

    it('should maintain state integrity across multiple saves', () => {
      // Add items, save, add more, save
      stateService.markTxProcessed('tx1');
      stateService.save();

      stateService.markTxProcessed('tx2');
      stateService.save();

      stateService.markWithdrawalProcessed(1);
      stateService.save();

      // Reload with same file and verify all data is intact
      const newStateService = new StateService(testStateFile);
      newStateService.load();

      expect(newStateService.isTxProcessed('tx1')).toBe(true);
      expect(newStateService.isTxProcessed('tx2')).toBe(true);
      expect(newStateService.isWithdrawalProcessed(1)).toBe(true);
    });
  });
});
