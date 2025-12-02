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

async function checkAddresses() {
  console.log('Checking what addresses relayer is monitoring:\n');

  const listAddresses = await rpc('listaddresses');
  console.log('listaddresses response:', JSON.stringify(listAddresses, null, 2));

  console.log('\n\nChecking unspent notes:');
  const unspent = await rpc('z_listunspent', [0, 9999999]);

  const uniqueAddresses = [...new Set(unspent.map((u: any) => u.address))];
  console.log(`\nUnique addresses with funds (${uniqueAddresses.length}):`);
  uniqueAddresses.forEach((addr) => {
    const addrStr = String(addr);
    console.log(`  ${addrStr.substring(0, 40)}...`);
  });
}

checkAddresses().catch(console.error);
