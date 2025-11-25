/**
 * Cryptographic utilities for NEAR Private Payroll
 *
 * Provides commitment generation and verification.
 */

import { sha256 } from '@noble/hashes/sha256';

/** Domain separator for commitments */
const COMMITMENT_DOMAIN = 'near-private-payroll:commitment:v1';
const BALANCE_DOMAIN = 'near-private-payroll:balance:v1';

/** A cryptographic commitment */
export interface Commitment {
  /** The commitment value (32 bytes) */
  value: Uint8Array;
  /** The blinding factor used (32 bytes) */
  blinding: Uint8Array;
}

/**
 * Generate a cryptographically secure random blinding factor
 */
export function generateBlinding(): Uint8Array {
  const blinding = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(blinding);
  } else {
    // Node.js fallback
    const nodeCrypto = require('crypto');
    const buf = nodeCrypto.randomBytes(32);
    blinding.set(buf);
  }
  return blinding;
}

/**
 * Generate a commitment to a value
 *
 * @param value - The value to commit to
 * @param blinding - Optional blinding factor (generated if not provided)
 * @param domain - Optional domain separator
 * @returns The commitment
 */
export function generateCommitment(
  value: bigint | number,
  blinding?: Uint8Array,
  domain: string = COMMITMENT_DOMAIN
): Commitment {
  const blindingFactor = blinding || generateBlinding();
  const valueBytes = bigintToLeBytes(BigInt(value));

  // Compute: H(domain || value || blinding)
  const data = new Uint8Array([
    ...new TextEncoder().encode(domain),
    ...valueBytes,
    ...blindingFactor,
  ]);

  const commitment = sha256(data);

  return {
    value: commitment,
    blinding: blindingFactor,
  };
}

/**
 * Verify a commitment
 *
 * @param commitment - The commitment to verify
 * @param value - The claimed value
 * @param blinding - The blinding factor
 * @param domain - The domain separator
 * @returns True if commitment is valid
 */
export function verifyCommitment(
  commitment: Uint8Array,
  value: bigint | number,
  blinding: Uint8Array,
  domain: string = COMMITMENT_DOMAIN
): boolean {
  const expected = generateCommitment(value, blinding, domain);
  return arraysEqual(commitment, expected.value);
}

/**
 * Generate a commitment for a salary value
 */
export function generateSalaryCommitment(
  salary: bigint | number,
  blinding?: Uint8Array
): Commitment {
  return generateCommitment(salary, blinding, COMMITMENT_DOMAIN);
}

/**
 * Generate a commitment for a balance value
 */
export function generateBalanceCommitment(
  balance: bigint | number,
  blinding?: Uint8Array
): Commitment {
  return generateCommitment(balance, blinding, BALANCE_DOMAIN);
}

/**
 * Convert a bigint to little-endian bytes (8 bytes for u64)
 */
function bigintToLeBytes(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  let remaining = value;
  for (let i = 0; i < 8; i++) {
    bytes[i] = Number(remaining & BigInt(0xff));
    remaining = remaining >> BigInt(8);
  }
  return bytes;
}

/**
 * Convert little-endian bytes to bigint
 */
export function leBytesToBigint(bytes: Uint8Array): bigint {
  let result = BigInt(0);
  for (let i = bytes.length - 1; i >= 0; i--) {
    result = (result << BigInt(8)) | BigInt(bytes[i]);
  }
  return result;
}

/**
 * Compare two Uint8Arrays for equality
 */
function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Convert Uint8Array to hex string
 */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to Uint8Array
 */
export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Encrypt data with a public key (placeholder - implement with actual encryption)
 */
export function encryptWithPublicKey(
  data: Uint8Array,
  publicKey: Uint8Array
): Uint8Array {
  // TODO: Implement proper encryption (e.g., NaCl box or ECIES)
  // For now, just XOR with a key derived from public key (NOT SECURE - development only)
  console.warn('Using insecure placeholder encryption - implement real encryption for production');
  const key = sha256(publicKey);
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] ^ key[i % key.length];
  }
  return result;
}

/**
 * Decrypt data with a private key (placeholder - implement with actual decryption)
 */
export function decryptWithPrivateKey(
  encryptedData: Uint8Array,
  privateKey: Uint8Array,
  publicKey: Uint8Array
): Uint8Array {
  // TODO: Implement proper decryption
  // For now, just XOR with key (same as encrypt for this placeholder)
  console.warn('Using insecure placeholder decryption - implement real decryption for production');
  const key = sha256(publicKey);
  const result = new Uint8Array(encryptedData.length);
  for (let i = 0; i < encryptedData.length; i++) {
    result[i] = encryptedData[i] ^ key[i % key.length];
  }
  return result;
}
