import axios from 'axios';

// User wallet RPC (sending FROM user TO bridge custody as a deposit)
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

async function testDeposit() {
  console.log('🧪 Testing Bridge Deposit Flow\n');

  // Get first address with funds from user wallet
  const unspent = await rpc('z_listunspent', [0, 9999999]);

  if (unspent.length === 0 || !unspent[0].address) {
    console.error('❌ No funds available in user wallet');
    return;
  }

  const fromAddr = unspent[0].address;
  // Bridge custody wallet's primary address (from relayer logs)
  const custodyAddr = 'utest1925n5vd2x8dyz6d0nq7z8t6sux4fcd3qzs3fmytj4kc47j78826en9ththx28fqe5a0uqg324t66cujdue6qypjv2v8yxvdz9hv4pdp4fejr550j7xmtw0zp28mrah4ufmp5ug2z06xvqykhu4dwc6hnww69f9vdqhf79cxzst0y49p9zwher3lnsknp53ly78jgfe4ky8u962t358l';
  const amount = 0.01; // Send 0.01 ZEC

  // Create memo with company ID (NEAR account)
  const companyId = 'nel349.testnet';
  const memoText = `company:${companyId}`;
  const memoHex = Buffer.from(memoText, 'utf8').toString('hex');

  console.log('Sending deposit transaction:');
  console.log(`  From: ${fromAddr.substring(0, 40)}...`);
  console.log(`  To (custody): ${custodyAddr.substring(0, 40)}...`);
  console.log(`  Amount: ${amount} ZEC`);
  console.log(`  Memo: ${memoText}`);
  console.log(`  Memo (hex): ${memoHex}\n`);

  try {
    const result = await rpc('z_sendmany', [
      fromAddr,
      [
        {
          address: custodyAddr,
          amount: amount,
          memo: memoHex,
        },
      ],
    ]);

    console.log('✅ Deposit transaction sent!');
    console.log('\nFull result:', JSON.stringify(result, null, 2));

    if (result.txids && result.txids.length > 0) {
      console.log('\n📝 Transaction IDs:');
      result.txids.forEach((txid: string) => {
        console.log(`  ${txid}`);
      });
    } else if (typeof result === 'string') {
      console.log('\n📝 Transaction ID:', result);
    }

    console.log('\n✅ The relayer should detect this deposit and mint wZEC on NEAR');
    console.log('Watch the relayer logs for: "🔔 New deposit detected!"');
  } catch (error: any) {
    console.error('❌ Failed to send deposit:', error.message);
  }
}

testDeposit().catch(console.error);
