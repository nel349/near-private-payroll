/**
 * Zcash → NEAR Bridge Relayer
 *
 * Monitors Zcash testnet for deposits to custody address
 * Mints wZEC on NEAR when deposits are confirmed
 * Processes withdrawals from NEAR back to Zcash
 */

require('dotenv').config();
const { connect, keyStores, utils } = require('near-api-js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const ZCASH_RPC = `http://${process.env.ZCASH_RPC_HOST}:${process.env.ZCASH_RPC_PORT}`;
const ZCASH_USER = process.env.ZCASH_RPC_USER;
const ZCASH_PASS = process.env.ZCASH_RPC_PASSWORD;
const CUSTODY_ACCOUNT_UUID = process.env.ZCASH_CUSTODY_ACCOUNT_UUID;

const NEAR_NETWORK = process.env.NEAR_NETWORK || 'testnet';
const WZEC_CONTRACT = process.env.WZEC_CONTRACT;
const INTENTS_ADAPTER = process.env.INTENTS_ADAPTER;
const RELAYER_ACCOUNT = process.env.NEAR_RELAYER_ACCOUNT;

const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL) || 30000;
const STATE_FILE = path.join(__dirname, 'relayer-state.json');

// State tracking
let state = {
  lastProcessedBlock: 0,
  processedTxids: [],
  pendingWithdrawals: []
};

/**
 * Call Zcash RPC
 */
async function zcashRpc(method, params = []) {
  try {
    const response = await axios.post(ZCASH_RPC, {
      jsonrpc: '1.0',
      id: 'bridge-relayer',
      method,
      params
    }, {
      auth: {
        username: ZCASH_USER,
        password: ZCASH_PASS
      },
      timeout: 10000
    });

    if (response.data.error) {
      throw new Error(`Zcash RPC error: ${response.data.error.message}`);
    }

    return response.data.result;
  } catch (error) {
    if (error.response) {
      throw new Error(`Zcash RPC failed: ${error.response.status} ${error.response.statusText}`);
    }
    throw error;
  }
}

/**
 * Wait for Zcash operation to complete
 */
async function waitForZcashOperation(opid, maxRetries = 60) {
  for (let i = 0; i < maxRetries; i++) {
    const status = await zcashRpc('z_getoperationstatus', [[opid]]);

    if (status && status.length > 0) {
      const op = status[0];

      if (op.status === 'success') {
        return op;
      } else if (op.status === 'failed') {
        throw new Error(`Zcash operation failed: ${op.error?.message || 'Unknown error'}`);
      }
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error('Zcash operation timeout');
}

/**
 * Parse company ID from transaction memo
 */
function parseCompanyId(memo) {
  if (!memo) return null;

  // Memo is hex-encoded
  const decoded = Buffer.from(memo, 'hex').toString('utf8');

  // Format: "company:account.testnet"
  if (decoded.startsWith('company:')) {
    return decoded.split(':')[1];
  }

  return null;
}

/**
 * Load state from file
 */
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      state = JSON.parse(data);
      console.log('Loaded state:', state);
    }
  } catch (error) {
    console.error('Failed to load state:', error.message);
  }
}

/**
 * Save state to file
 */
function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Failed to save state:', error.message);
  }
}

/**
 * Monitor Zcash deposits
 */
async function monitorDeposits(nearAccount) {
  try {
    const currentBlock = await zcashRpc('getblockcount');

    if (currentBlock > state.lastProcessedBlock) {
      console.log(`New Zcash blocks: ${state.lastProcessedBlock} → ${currentBlock}`);

      // Get received transactions to custody address
      const received = await zcashRpc('z_listreceivedbyaddress', [
        CUSTODY_ADDRESS,
        1 // minconf
      ]);

      for (const tx of received) {
        // Skip if already processed
        if (state.processedTxids.includes(tx.txid)) {
          continue;
        }

        console.log('\n🔔 New deposit detected!');
        console.log('  Txid:', tx.txid);
        console.log('  Amount:', tx.amount, 'ZEC');
        console.log('  Memo:', tx.memo || '(none)');

        // Parse company ID from memo
        const companyId = parseCompanyId(tx.memo);
        const receiverId = companyId || 'default.testnet';

        console.log('  Receiver:', receiverId);

        // Convert to smallest unit (8 decimals)
        const amount = Math.floor(tx.amount * 100000000).toString();

        try {
          // Mint wZEC on NEAR
          console.log(`  Minting ${amount} wZEC units...`);

          const result = await nearAccount.functionCall({
            contractId: WZEC_CONTRACT,
            methodName: 'mint',
            args: {
              receiver_id: receiverId,
              amount: amount,
              zcash_tx_hash: tx.txid
            },
            gas: '50000000000000',
            attachedDeposit: '1'
          });

          console.log('  ✅ Minted successfully!');
          console.log('  NEAR tx:', result.transaction.hash);

          // Mark as processed
          state.processedTxids.push(tx.txid);
          saveState();

        } catch (error) {
          console.error('  ❌ Minting failed:', error.message);
        }
      }

      state.lastProcessedBlock = currentBlock;
      saveState();
    }

  } catch (error) {
    console.error('Error monitoring deposits:', error.message);
  }
}

/**
 * Monitor NEAR withdrawals (future implementation)
 */
async function monitorWithdrawals(nearAccount) {
  // TODO: Monitor intents adapter for pending withdrawals
  // Process by sending ZEC from custody address to destination
}

/**
 * Main relayer loop
 */
async function main() {
  console.log('🌉 Zcash → NEAR Bridge Relayer');
  console.log('================================\n');

  // Load previous state
  loadState();

  // Test Zcash connection
  console.log('Testing Zcash RPC connection...');
  try {
    const info = await zcashRpc('getblockchaininfo');
    console.log('  ✅ Connected to Zcash testnet');
    console.log('  Block height:', info.blocks);
    console.log('  Chain:', info.chain);

    if (!state.lastProcessedBlock) {
      state.lastProcessedBlock = info.blocks;
      saveState();
    }
  } catch (error) {
    console.error('  ❌ Zcash connection failed:', error.message);
    console.error('\nMake sure Zcash node is running:');
    console.error('  docker start zcash-testnet');
    console.error('  OR');
    console.error('  zcashd -testnet -daemon');
    process.exit(1);
  }

  console.log('\nCustody address:', CUSTODY_ADDRESS);

  // Check custody address balance
  try {
    const balance = await zcashRpc('z_getbalance', [CUSTODY_ADDRESS]);
    console.log('Custody balance:', balance, 'ZEC\n');
  } catch (error) {
    console.log('Custody balance: (unable to check)\n');
  }

  // Connect to NEAR
  console.log('Connecting to NEAR', NEAR_NETWORK, '...');

  const keyStore = new keyStores.UnencryptedFileSystemKeyStore(
    path.join(process.env.HOME, '.near-credentials')
  );

  const near = await connect({
    networkId: NEAR_NETWORK,
    keyStore,
    nodeUrl: `https://rpc.${NEAR_NETWORK}.near.org`,
    walletUrl: `https://wallet.${NEAR_NETWORK}.near.org`,
    helperUrl: `https://helper.${NEAR_NETWORK}.near.org`
  });

  const nearAccount = await near.account(RELAYER_ACCOUNT);

  try {
    const accountState = await nearAccount.state();
    console.log('  ✅ Connected as:', RELAYER_ACCOUNT);
    console.log('  Balance:', utils.format.formatNearAmount(accountState.amount), 'NEAR\n');
  } catch (error) {
    console.error('  ❌ NEAR connection failed:', error.message);
    console.error('\nMake sure you have credentials for:', RELAYER_ACCOUNT);
    console.error('  near login');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log('  wZEC Contract:', WZEC_CONTRACT);
  console.log('  Intents Adapter:', INTENTS_ADAPTER);
  console.log('  Poll Interval:', POLL_INTERVAL / 1000, 'seconds\n');

  console.log('🚀 Relayer started! Monitoring for deposits...\n');

  // Main loop
  setInterval(async () => {
    await monitorDeposits(nearAccount);
    // await monitorWithdrawals(nearAccount); // TODO
  }, POLL_INTERVAL);

  // Initial check
  await monitorDeposits(nearAccount);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down relayer...');
  saveState();
  process.exit(0);
});

// Run relayer
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
