import { connect, keyStores } from 'near-api-js';
import { WZecToken } from '@near-private-payroll/sdk';

async function testWithdrawalDetection() {
  console.log('🔍 Testing Withdrawal Detection\n');

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
    // Get current withdrawal nonce
    const currentNonce = await wzec.getWithdrawalNonce();
    console.log(`Current withdrawal nonce: ${currentNonce}`);

    if (currentNonce === 0) {
      console.log('No withdrawals yet');
      return;
    }

    // Query each withdrawal request
    console.log(`\nQuerying ${currentNonce} withdrawal request(s):\n`);
    for (let nonce = 1; nonce <= currentNonce; nonce++) {
      try {
        const request = await wzec.getWithdrawalRequest(nonce);

        if (request) {
          console.log(`Withdrawal ${nonce}:`);
          console.log(`  Burner: ${request.burner}`);
          console.log(`  Amount: ${request.amount} wZEC`);
          console.log(`  Zcash Address: ${request.zcash_shielded_address.substring(0, 40)}...`);
          console.log(`  Timestamp: ${request.timestamp}`);
          console.log();
        } else {
          console.log(`Withdrawal ${nonce}: NOT FOUND`);
        }
      } catch (error: any) {
        console.error(`Error querying withdrawal ${nonce}:`, error.message);
      }
    }
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

testWithdrawalDetection().catch(console.error);
