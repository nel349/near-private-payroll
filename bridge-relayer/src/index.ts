/**
 * Bridge Relayer - Entry Point
 */

import { loadConfig } from './config';
import { BridgeRelayer } from './relayer';

async function main() {
  // Load configuration
  const config = loadConfig();

  // Create relayer instance
  const relayer = new BridgeRelayer(config);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nShutting down relayer...');
    relayer.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n\nShutting down relayer...');
    relayer.stop();
    process.exit(0);
  });

  // Initialize and start
  try {
    await relayer.initialize();
    await relayer.start();
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
