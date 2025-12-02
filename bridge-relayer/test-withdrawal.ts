/**
 * Test Withdrawal Flow
 *
 * This script tests burning wZEC tokens to withdraw back to Zcash
 */

import { connect, keyStores } from 'near-api-js';
import { WZecToken } from '@near-private-payroll/sdk';

async function testWithdrawal() {
  console.log('🧪 Testing Bridge Withdrawal Flow\n');

  // Connect to NEAR testnet
  const keyStore = new keyStores.UnencryptedFileSystemKeyStore(
    `${process.env.HOME}/.near-credentials`
  );

  const near = await connect({
    networkId: 'testnet',
    keyStore,
    nodeUrl: 'https://rpc.testnet.fastnear.com',
    walletUrl: 'https://wallet.testnet.near.org',
    helperUrl: 'https://helper.testnet.near.org',
  });

  const accountId = 'nel349.testnet';
  const wzecContractId = 'wzec.nel349.testnet';

  const account = await near.account(accountId);
  const wzec = new WZecToken(account, wzecContractId);

  try {
    // Check current balance
    const balance = await wzec.balanceOf(accountId);
    console.log(`Current wZEC balance: ${balance} (${parseFloat(balance) / 100000000} ZEC)\n`);

    if (balance === '0') {
      console.error('❌ No wZEC balance to withdraw');
      return;
    }

    // Withdraw amount (0.005 ZEC = 500000 zatoshis)
    const withdrawAmount = '500000';
    const withdrawZec = parseFloat(withdrawAmount) / 100000000;

    // Destination Zcash address (user wallet - Sapling address)
    const zcashAddress = 'utest1pusjeupt6ynuyk636r8sl207hcdyf8m2raxs4ktegwwx8qgf53rtzaw2ls5c3t6tmu745xyqs3mrzjv83ksuqmxngglgsvwjxgtvzdr3';

    console.log('Withdrawal details:');
    console.log(`  From: ${accountId}`);
    console.log(`  Amount: ${withdrawAmount} wZEC units (${withdrawZec} ZEC)`);
    console.log(`  To (Zcash): ${zcashAddress.substring(0, 40)}...`);
    console.log();

    console.log('⚠️  This will burn wZEC and create a withdrawal request.');
    console.log('⚠️  The relayer must be running to process the withdrawal.\n');

    // Burn wZEC for Zcash withdrawal
    console.log('Burning wZEC...');
    await wzec.burnForZcash(withdrawAmount, zcashAddress);

    console.log('✅ Withdrawal request submitted!');
    console.log('\nThe relayer should detect this burn event and send ZEC.');
    console.log('Watch the relayer logs for: "🔥 New withdrawal detected!"');

    // Check new balance
    const newBalance = await wzec.balanceOf(accountId);
    console.log(`\nNew wZEC balance: ${newBalance} (${parseFloat(newBalance) / 100000000} ZEC)`);
  } catch (error: any) {
    console.error('❌ Withdrawal failed:', error.message);
    if (error.type === 'AccountDoesNotExist') {
      console.error('Make sure the account has wZEC tokens to burn');
    }
  }
}

testWithdrawal().catch(console.error);
