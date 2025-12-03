/**
 * NEAR API helpers for wallet integration
 */

import { providers, utils as nearUtils } from 'near-api-js';
import { CONFIG } from '@/config/contracts';

/**
 * Get NEAR JSON RPC provider
 */
export function getNearProvider(): providers.JsonRpcProvider {
  return new providers.JsonRpcProvider({
    url: CONFIG.nodeUrl,
  });
}

/**
 * Format NEAR amount from yoctoNEAR
 */
export function formatNearAmount(amount: string): string {
  const amountInNear = BigInt(amount) / BigInt(10 ** 24);
  return amountInNear.toString();
}

/**
 * Parse NEAR amount to yoctoNEAR
 */
export function parseNearAmount(amount: string): string {
  const amountInYocto = BigInt(amount) * BigInt(10 ** 24);
  return amountInYocto.toString();
}
