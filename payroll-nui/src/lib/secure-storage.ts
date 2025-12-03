/**
 * Secure Storage Utilities
 *
 * Password-based encryption for storing sensitive keypairs in browser storage.
 * Uses Web Crypto API with PBKDF2 key derivation and AES-GCM encryption.
 */

export interface Keypair {
  privateKey: number[];
  publicKey: number[];
}

export interface EncryptedData {
  encryptedData: string; // base64
  salt: string; // base64
  iv: string; // base64
}

// Convert ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Derive an AES-GCM encryption key from a password using PBKDF2
 */
async function deriveKeyFromPassword(
  password: string,
  salt: ArrayBuffer
): Promise<CryptoKey> {
  const encoder = new TextEncoder();

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Derive AES-GCM key using PBKDF2
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000, // OWASP recommended minimum
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return key;
}

/**
 * Encrypt a keypair with a password
 */
export async function encryptKeypair(
  keypair: Keypair,
  password: string
): Promise<EncryptedData> {
  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Derive encryption key from password
  const key = await deriveKeyFromPassword(password, salt.buffer);

  // Encrypt the keypair data
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(keypair));

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    data
  );

  // Return base64-encoded data
  return {
    encryptedData: arrayBufferToBase64(encrypted),
    salt: arrayBufferToBase64(salt.buffer),
    iv: arrayBufferToBase64(iv.buffer),
  };
}

/**
 * Decrypt a keypair with a password
 * Throws an error if the password is incorrect
 */
export async function decryptKeypair(
  encryptedData: EncryptedData,
  password: string
): Promise<Keypair> {
  // Convert base64 back to buffers
  const salt = base64ToArrayBuffer(encryptedData.salt);
  const iv = base64ToArrayBuffer(encryptedData.iv);
  const ciphertext = base64ToArrayBuffer(encryptedData.encryptedData);

  // Derive decryption key from password
  const key = await deriveKeyFromPassword(password, salt);

  try {
    // Decrypt the data
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(iv),
      },
      key,
      ciphertext
    );

    // Parse the decrypted JSON
    const decoder = new TextDecoder();
    const keypair = JSON.parse(decoder.decode(decrypted));

    return keypair;
  } catch (error) {
    // Decryption failure usually means wrong password
    throw new Error('Failed to decrypt keypair. Incorrect password?');
  }
}

/**
 * Save encrypted keypair to localStorage
 */
export function saveEncryptedKeypair(
  storageKey: string,
  encryptedData: EncryptedData
): void {
  localStorage.setItem(storageKey, JSON.stringify(encryptedData));
}

/**
 * Load encrypted keypair from localStorage
 */
export function loadEncryptedKeypair(storageKey: string): EncryptedData | null {
  const stored = localStorage.getItem(storageKey);
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as EncryptedData;
  } catch (error) {
    console.error('Failed to parse encrypted keypair:', error);
    return null;
  }
}

/**
 * Check if an encrypted keypair exists in storage
 */
export function hasEncryptedKeypair(storageKey: string): boolean {
  return localStorage.getItem(storageKey) !== null;
}

/**
 * Remove encrypted keypair from storage
 */
export function removeEncryptedKeypair(storageKey: string): void {
  localStorage.removeItem(storageKey);
}

/**
 * In-memory session cache for decrypted keypair
 * Avoids repeatedly asking for password during a session
 */
class KeypairCache {
  private cache: Map<string, Keypair> = new Map();

  set(key: string, keypair: Keypair): void {
    this.cache.set(key, keypair);
  }

  get(key: string): Keypair | undefined {
    return this.cache.get(key);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  remove(key: string): void {
    this.cache.delete(key);
  }
}

export const keypairCache = new KeypairCache();

/**
 * Get a decrypted keypair from cache or decrypt with password
 */
export async function getKeypair(
  storageKey: string,
  password: string
): Promise<Keypair> {
  // Check cache first
  if (keypairCache.has(storageKey)) {
    return keypairCache.get(storageKey)!;
  }

  // Load and decrypt from storage
  const encrypted = loadEncryptedKeypair(storageKey);
  if (!encrypted) {
    throw new Error('No encrypted keypair found in storage');
  }

  const keypair = await decryptKeypair(encrypted, password);

  // Cache for this session
  keypairCache.set(storageKey, keypair);

  return keypair;
}
