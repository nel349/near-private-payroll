import axios from 'axios';

const BRIDGE_RPC_URL = 'http://127.0.0.1:28232';
const BRIDGE_RPC_USER = 'zcashrpc';
const BRIDGE_RPC_PASSWORD = 'testpass123';

async function rpc(method: string, params: any[] = []) {
  const response = await axios.post(
    BRIDGE_RPC_URL,
    {
      jsonrpc: '1.0',
      id: 'test',
      method,
      params,
    },
    {
      auth: {
        username: BRIDGE_RPC_USER,
        password: BRIDGE_RPC_PASSWORD,
      },
    }
  );

  if (response.data.error) {
    throw new Error(`RPC error: ${JSON.stringify(response.data.error)}`);
  }

  return response.data.result;
}

async function checkDeposits() {
  console.log('🔍 Checking bridge custody wallet for new deposits\n');

  const unspent = await rpc('z_listunspent', [0, 9999999]);

  console.log(`Found ${unspent.length} unspent notes:\n`);

  for (const note of unspent) {
    console.log(`Txid: ${note.txid}`);
    console.log(`  Amount: ${note.value} ZEC`);
    console.log(`  Pool: ${note.pool}`);
    console.log(`  Confirmations: ${note.confirmations}`);
    console.log(`  Address: ${note.address ? note.address.substring(0, 40) + '...' : '(internal)'}`);

    if (note.memo) {
      const memoText = Buffer.from(note.memo, 'hex').toString('utf8');
      console.log(`  Memo (hex): ${note.memo}`);
      console.log(`  Memo (text): ${memoText}`);
    } else {
      console.log(`  Memo: (none)`);
    }
    console.log();
  }
}

checkDeposits().catch(console.error);
