/**
 * State Management Service
 */

import * as fs from 'fs';
import * as path from 'path';
import { RelayerState } from '../types';

const DEFAULT_STATE_FILE = path.join(__dirname, '../../relayer-state.json');

export class StateService {
  private state: RelayerState = {
    lastProcessedBlock: 0,
    processedTxids: [],
    processedWithdrawalNonces: [],
    pendingWithdrawals: [],
  };

  private stateFile: string;

  constructor(stateFile?: string) {
    this.stateFile = stateFile || DEFAULT_STATE_FILE;
  }

  /**
   * Load state from disk
   */
  load(): void {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = fs.readFileSync(this.stateFile, 'utf8');
        const loadedState = JSON.parse(data);

        // Migrate old state format (add missing fields with defaults)
        this.state = {
          ...loadedState,
          processedWithdrawalNonces: loadedState.processedWithdrawalNonces || [],
          pendingWithdrawals: loadedState.pendingWithdrawals || [],
        };

        console.log('✅ Loaded previous state');
        console.log(`   Last processed block: ${this.state.lastProcessedBlock}`);
        console.log(`   Processed txids: ${this.state.processedTxids.length}`);
      } else {
        console.log('No previous state found, starting fresh');
      }
    } catch (error: any) {
      console.error('Failed to load state:', error.message);
    }
  }

  /**
   * Save state to disk
   */
  save(): void {
    try {
      fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
    } catch (error: any) {
      console.error('Failed to save state:', error.message);
    }
  }

  /**
   * Get current state
   */
  get(): RelayerState {
    return this.state;
  }

  /**
   * Update last processed block
   */
  setLastProcessedBlock(blockHeight: number): void {
    this.state.lastProcessedBlock = blockHeight;
    this.save();
  }

  /**
   * Mark transaction as processed
   */
  markTxProcessed(txid: string): void {
    if (!this.state.processedTxids.includes(txid)) {
      this.state.processedTxids.push(txid);
      this.save();
    }
  }

  /**
   * Check if transaction was already processed
   */
  isTxProcessed(txid: string): boolean {
    return this.state.processedTxids.includes(txid);
  }

  /**
   * Get processed transaction IDs
   */
  getProcessedTxids(): string[] {
    return this.state.processedTxids;
  }

  /**
   * Mark withdrawal nonce as processed
   */
  markWithdrawalProcessed(nonce: number): void {
    if (!this.state.processedWithdrawalNonces.includes(nonce)) {
      this.state.processedWithdrawalNonces.push(nonce);
      this.save();
    }
  }

  /**
   * Get processed withdrawal nonces
   */
  getProcessedWithdrawalNonces(): number[] {
    return this.state.processedWithdrawalNonces;
  }

  /**
   * Check if withdrawal nonce was already processed
   */
  isWithdrawalProcessed(nonce: number): boolean {
    return this.state.processedWithdrawalNonces.includes(nonce);
  }
}
