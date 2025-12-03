import { NextResponse } from 'next/server';

/**
 * Get bridge custody address for deposits
 *
 * In production, this would query the bridge relayer service
 * For now, return the configured address
 */
export async function GET() {
  try {
    // TODO: In production, fetch from bridge relayer API or config service
    // For now, use environment variable or hardcoded testnet address
    const custodyAddress = process.env.BRIDGE_CUSTODY_ADDRESS || '';

    if (!custodyAddress) {
      return NextResponse.json(
        { error: 'Bridge custody address not configured' },
        { status: 503 }
      );
    }

    return NextResponse.json({
      address: custodyAddress,
      network: process.env.NEXT_PUBLIC_NEAR_NETWORK || 'testnet',
    });
  } catch (error) {
    console.error('Error fetching custody address:', error);
    return NextResponse.json(
      { error: 'Failed to fetch custody address' },
      { status: 500 }
    );
  }
}
