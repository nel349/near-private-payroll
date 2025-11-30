/**
 * StateService Tests
 *
 * Tests state management logic without mocking filesystem
 */

import { StateService } from '../state.service';
import * as fs from 'fs';
import * as path from 'path';

// Use real filesystem in temp directory
const TEST_STATE_FILE = path.join(__dirname, '../../../test-relayer-state.json');

describe('StateService - Real Filesystem Tests', () => {
  let service: StateService;

  beforeEach(() => {
    // Clean up test state file
    if (fs.existsSync(TEST_STATE_FILE)) {
      fs.unlinkSync(TEST_STATE_FILE);
    }
    service = new StateService();
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(TEST_STATE_FILE)) {
      fs.unlinkSync(TEST_STATE_FILE);
    }
  });

  describe('Transaction ID tracking', () => {
    it('should track multiple unique txids', () => {
      service.markTxProcessed('tx1');
      service.markTxProcessed('tx2');
      service.markTxProcessed('tx3');

      expect(service.isTxProcessed('tx1')).toBe(true);
      expect(service.isTxProcessed('tx2')).toBe(true);
      expect(service.isTxProcessed('tx3')).toBe(true);
      expect(service.isTxProcessed('tx4')).toBe(false);
    });

    it('should not duplicate txids', () => {
      service.markTxProcessed('tx1');
      service.markTxProcessed('tx1');
      service.markTxProcessed('tx1');

      const txids = service.getProcessedTxids();
      expect(txids.filter((id) => id === 'tx1')).toHaveLength(1);
    });

    it('should preserve txid order', () => {
      service.markTxProcessed('tx1');
      service.markTxProcessed('tx2');
      service.markTxProcessed('tx3');

      const txids = service.getProcessedTxids();
      expect(txids).toEqual(['tx1', 'tx2', 'tx3']);
    });
  });

  describe('Block height tracking', () => {
    it('should update last processed block', () => {
      service.setLastProcessedBlock(100);
      expect(service.get().lastProcessedBlock).toBe(100);

      service.setLastProcessedBlock(200);
      expect(service.get().lastProcessedBlock).toBe(200);
    });

    it('should allow setting block height to zero', () => {
      service.setLastProcessedBlock(100);
      service.setLastProcessedBlock(0);
      expect(service.get().lastProcessedBlock).toBe(0);
    });
  });

  describe('State consistency', () => {
    it('should maintain consistent state across operations', () => {
      // Simulate relayer processing blocks
      service.setLastProcessedBlock(1000);
      service.markTxProcessed('tx-at-1000-a');
      service.markTxProcessed('tx-at-1000-b');

      service.setLastProcessedBlock(1001);
      service.markTxProcessed('tx-at-1001');

      const state = service.get();
      expect(state.lastProcessedBlock).toBe(1001);
      expect(state.processedTxids).toHaveLength(3);
      expect(state.processedTxids).toContain('tx-at-1000-a');
      expect(state.processedTxids).toContain('tx-at-1000-b');
      expect(state.processedTxids).toContain('tx-at-1001');
    });
  });
});

describe('StateService - Idempotency', () => {
  it('should be safe to call markTxProcessed multiple times', () => {
    const service = new StateService();

    // Simulate same tx being processed multiple times (e.g., retries)
    for (let i = 0; i < 10; i++) {
      service.markTxProcessed('same-tx');
    }

    expect(service.getProcessedTxids()).toHaveLength(1);
    expect(service.isTxProcessed('same-tx')).toBe(true);
  });

  it('should be safe to call setLastProcessedBlock with same value', () => {
    const service = new StateService();

    service.setLastProcessedBlock(500);
    service.setLastProcessedBlock(500);
    service.setLastProcessedBlock(500);

    expect(service.get().lastProcessedBlock).toBe(500);
  });
});
