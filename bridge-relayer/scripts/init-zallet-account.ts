import axios from 'axios';

const ZALLET_RPC_URL = 'http://127.0.0.1:28232';
const ZALLET_RPC_USER = 'zcashrpc';
const ZALLET_RPC_PASSWORD = 'testpass123';

async function rpc(method: string, params: any[] = []) {
  const response = await axios.post(
    ZALLET_RPC_URL,
    {
      jsonrpc: '1.0',
      id: 'init',
      method,
      params,
    },
    {
      auth: {
        username: ZALLET_RPC_USER,
        password: ZALLET_RPC_PASSWORD,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (response.data.error) {
    throw new Error(`RPC error: ${JSON.stringify(response.data.error)}`);
  }

  return response.data.result;
}

async function initAccount() {
  console.log('🔧 Initializing Zallet account from existing mnemonic...\n');

  // Check if accounts already exist
  const accounts = await rpc('z_listaccounts');
  if (accounts && accounts.length > 0) {
    console.log('✅ Account already exists!');
    console.log('Account UUID:', accounts[0].account_uuid);
    return;
  }

  // Try to create a new account by getting a new address
  // This should trigger account derivation from the existing mnemonic
  try {
    console.log('Creating new account from mnemonic...');
    const address = await rpc('z_getnewaddress', ['sapling']);
    console.log('✅ Created new account!');
    console.log('Address:', address);

    // List accounts again to confirm
    const newAccounts = await rpc('z_listaccounts');
    if (newAccounts && newAccounts.length > 0) {
      console.log('\nAccount UUID:', newAccounts[0].account_uuid);
    }
  } catch (error: any) {
    console.error('❌ Error creating account:', error.message);
    console.log('\nTrying alternative method: z_getaddressforaccount...');

    // If z_getnewaddress doesn't work, the mnemonic might not be imported
    console.log('The wallet database was reset but mnemonic should be in encryption-identity.txt');
    console.log('You may need to stop Zallet and run: zallet generate-mnemonic');
  }
}

initAccount().catch(console.error);
