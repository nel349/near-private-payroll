import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

/**
 * Simulate ZEC deposit via bridge (testnet only)
 *
 * This endpoint simulates what would happen when a user sends ZEC to the bridge custody address.
 * It triggers the bridge-relayer to mint wZEC and deposit to the payroll contract.
 *
 * In production, users would send real ZEC to the custody address with a memo containing their
 * company ID, and the bridge-relayer would automatically detect and process it.
 */

// User wallet RPC (sending FROM user TO bridge custody as a deposit)
const USER_RPC_URL = process.env.ZCASH_USER_RPC_URL || 'http://127.0.0.1:28233';
const USER_RPC_USER = process.env.ZCASH_USER_RPC_USER || 'userzcash';
const USER_RPC_PASSWORD = process.env.ZCASH_USER_RPC_PASSWORD || 'userpass123';

async function rpcCall(method: string, params: any[] = []) {
  try {
    const response = await axios.post(
      USER_RPC_URL,
      {
        jsonrpc: '1.0',
        id: 'api-test',
        method,
        params,
      },
      {
        auth: {
          username: USER_RPC_USER,
          password: USER_RPC_PASSWORD,
        },
        timeout: 30000, // 30 second timeout
      }
    );

    if (response.data.error) {
      throw new Error(`RPC error: ${JSON.stringify(response.data.error)}`);
    }

    return response.data.result;
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Zcash RPC not available. Make sure Zallet is running.');
    }
    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, companyId } = body;

    if (!amount || parseFloat(amount) <= 0) {
      return NextResponse.json(
        { error: 'Valid amount is required' },
        { status: 400 }
      );
    }

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID (NEAR account) is required' },
        { status: 400 }
      );
    }

    console.log('[Bridge API] Simulating ZEC deposit:');
    console.log(`  Amount: ${amount} ZEC`);
    console.log(`  Company: ${companyId}`);

    // Get first address with funds from user wallet
    const unspent = await rpcCall('z_listunspent', [0, 9999999]);

    if (!unspent || unspent.length === 0 || !unspent[0].address) {
      return NextResponse.json(
        {
          error: 'No funds available in Zcash wallet. Please fund the user wallet first.',
          details: 'Run: zcash-cli generate 101 to mine blocks and get test ZEC'
        },
        { status: 503 }
      );
    }

    const fromAddr = unspent[0].address;

    // Get custody address from environment or use hardcoded testnet address
    const custodyAddr = process.env.BRIDGE_CUSTODY_ADDRESS ||
      'utest1925n5vd2x8dyz6d0nq7z8t6sux4fcd3qzs3fmytj4kc47j78826en9ththx28fqe5a0uqg324t66cujdue6qypjv2v8yxvdz9hv4pdp4fejr550j7xmtw0zp28mrah4ufmp5ug2z06xvqykhu4dwc6hnww69f9vdqhf79cxzst0y49p9zwher3lnsknp53ly78jgfe4ky8u962t358l';

    // Create memo with company ID
    const memoText = `company:${companyId}`;
    const memoHex = Buffer.from(memoText, 'utf8').toString('hex');

    console.log('[Bridge API] Sending ZEC transaction...');
    console.log(`  From: ${fromAddr.substring(0, 40)}...`);
    console.log(`  To (custody): ${custodyAddr.substring(0, 40)}...`);
    console.log(`  Memo: ${memoText}`);

    // Send ZEC to bridge custody address
    const result = await rpcCall('z_sendmany', [
      fromAddr,
      [
        {
          address: custodyAddr,
          amount: parseFloat(amount),
          memo: memoHex,
        },
      ],
    ]);

    let txid: string;
    if (result.txids && result.txids.length > 0) {
      txid = result.txids[0];
    } else if (typeof result === 'string') {
      txid = result;
    } else {
      txid = 'unknown';
    }

    console.log('[Bridge API] ✅ ZEC transaction sent:', txid);
    console.log('[Bridge API] The bridge-relayer should detect this and mint wZEC');

    return NextResponse.json({
      success: true,
      message: 'ZEC deposit initiated. Bridge-relayer will process and mint wZEC.',
      txid,
      amount: parseFloat(amount),
      companyId,
      note: 'Watch bridge-relayer logs for: "🔔 New deposit detected!"',
    });

  } catch (error: any) {
    console.error('[Bridge API] Error:', error);

    let errorMessage = 'Failed to process bridge deposit';
    let statusCode = 500;

    if (error.message.includes('Zcash RPC not available')) {
      errorMessage = 'Zcash wallet not running. Please start Zallet.';
      statusCode = 503;
    } else if (error.message.includes('insufficient')) {
      errorMessage = 'Insufficient ZEC balance in wallet.';
      statusCode = 400;
    }

    return NextResponse.json(
      {
        error: errorMessage,
        details: error.message
      },
      { status: statusCode }
    );
  }
}
