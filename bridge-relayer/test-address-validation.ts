import { connect, keyStores } from 'near-api-js';

async function testAddressValidation() {
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
  const account = await near.account(accountId);

  // Test different address formats
  const testAddresses = [
    'utest1pusjeupt6ynuyk636r8sl207hcdyf8m2raxs4ktegwwx8qgf53rtzaw2ls5c3t6tmu745xyqs3mrzjv83ksuqmxngglgsvwjxgtvzdr3',
    'ztestsapling1ydr32a678tr6lcgmxhvqcekk7tg0ekmt7hhzkcj0rjw84qe3ha5rwd989hxz4w5kqy9rw6ka6cj',
  ];

  for (const addr of testAddresses) {
    console.log(`\nTesting: ${addr.substring(0, 20)}...`);
    console.log(`Starts with: ${addr.substring(0, 10)}`);

    try {
      await account.functionCall({
        contractId: 'wzec.nel349.testnet',
        methodName: 'burn_for_zcash',
        args: {
          amount: '1', // Minimal amount
          zcash_shielded_address: addr,
        },
        gas: BigInt('30000000000000'),
      });
      console.log('✅ ACCEPTED');
    } catch (error: any) {
      if (error.message.includes('Invalid Zcash')) {
        console.log('❌ REJECTED: Invalid Zcash shielded address');
      } else if (error.message.includes('balance')) {
        console.log('✅ ACCEPTED (failed on balance check, so validation passed)');
      } else {
        console.log(`❌ ERROR: ${error.message}`);
      }
    }
  }
}

testAddressValidation().catch(console.error);
