import axios from 'axios';

// User wallet RPC (sending FROM user TO bridge)
const USER_RPC_URL = 'http://127.0.0.1:28233';
const USER_RPC_USER = 'userzcash';
const USER_RPC_PASSWORD = 'userpass123';

async function rpc(method: string, params: any[] = []) {
  const response = await axios.post(
    USER_RPC_URL,
    {
      jsonrpc: '1.0',
      id: 'test',
      method,
      params,
    },
    {
      auth: {
        username: USER_RPC_USER,
        password: USER_RPC_PASSWORD,
      },
    }
  );

  if (response.data.error) {
    throw new Error(`RPC error: ${JSON.stringify(response.data.error)}`);
  }

  return response.data.result;
}

async function test() {
  console.log('Getting unspent notes...');
  const unspent = await rpc('z_listunspent', [0, 9999999]);

  console.log(`\nFound ${unspent.length} unspent notes:`);
  for (const note of unspent) {
    console.log(`  Address: ${note.address ? note.address.substring(0, 40) + '...' : '(internal)'}`);
    console.log(`  Amount: ${note.value} ZEC`);
    console.log(`  Pool: ${note.pool}`);
    console.log(`  Confirmations: ${note.confirmations}`);
    console.log();
  }

  // Try to send from the first address that has funds
  if (unspent.length > 0 && unspent[0].address) {
    const fromAddr = unspent[0].address;
    // Bridge custody wallet's first address
    const destAddr = 'utest183hqcyzwawhzaf57f6fuhmh6jupy3vep3yqht3ktzs2a5v7et4cwecqj3rteh949m2y559qezqwlwmfphqwerr0mkh3ak6l4e3t9tkmdkcfquwaefxczwpknzvmauac3k9e8m0c8tdh5pnkrrs4wg4pgwtc3shferrtlh5w7vly835qse6fjlfnefcc40zqkvqcqm6ms0yeuu7czyud';
    const amount = 0.1; // Send 0.1 ZEC

    console.log(`\nTesting z_sendmany fix - User wallet → Bridge custody wallet:`);
    console.log(`  From (user wallet): ${fromAddr.substring(0, 40)}...`);
    console.log(`  To (bridge custody): ${destAddr.substring(0, 40)}...`);
    console.log(`  Amount: ${amount} ZEC`);

    try {
      const result = await rpc('z_sendmany', [
        fromAddr,
        [{ address: destAddr, amount }],
      ]);

      console.log(`\n✅ SUCCESS! Transaction IDs:`, result.txids);
    } catch (error: any) {
      console.error(`\n❌ FAILED:`, error.message);
    }
  }
}

test().catch(console.error);
