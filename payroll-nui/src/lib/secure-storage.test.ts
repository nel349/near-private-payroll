/**
 * Tests for secure storage (password-based encryption)
 */

import {
  encryptKeypair,
  decryptKeypair,
  saveEncryptedKeypair,
  loadEncryptedKeypair,
  removeEncryptedKeypair,
  EncryptedData,
  Keypair,
} from './secure-storage';

// Mock localStorage for Node.js environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

// @ts-ignore
global.localStorage = localStorageMock;

describe('Secure Storage', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('Password-based encryption', () => {
    it('should encrypt keypair with password', async () => {
      const keypair: Keypair = {
        privateKey: [1, 2, 3, 4, 5],
        publicKey: [6, 7, 8, 9, 10],
      };
      const password = 'securePassword123';

      const encrypted = await encryptKeypair(keypair, password);

      expect(encrypted.encryptedData).toBeTruthy();
      expect(encrypted.salt).toBeTruthy();
      expect(encrypted.iv).toBeTruthy();

      // Encrypted data should be base64
      expect(encrypted.encryptedData).toMatch(/^[A-Za-z0-9+/=]+$/);
      expect(encrypted.salt).toMatch(/^[A-Za-z0-9+/=]+$/);
      expect(encrypted.iv).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it('should decrypt keypair with correct password', async () => {
      const originalKeypair: Keypair = {
        privateKey: [10, 20, 30, 40, 50],
        publicKey: [60, 70, 80, 90, 100],
      };
      const password = 'mySecretPassword!@#';

      const encrypted = await encryptKeypair(originalKeypair, password);
      const decrypted = await decryptKeypair(encrypted, password);

      expect(decrypted).toEqual(originalKeypair);
    });

    it('should fail to decrypt with wrong password', async () => {
      const keypair: Keypair = {
        privateKey: [1, 2, 3],
        publicKey: [4, 5, 6],
      };
      const correctPassword = 'correctPassword';
      const wrongPassword = 'wrongPassword';

      const encrypted = await encryptKeypair(keypair, correctPassword);

      await expect(decryptKeypair(encrypted, wrongPassword)).rejects.toThrow();
    });

    it('should produce different encrypted data for same keypair (non-deterministic)', async () => {
      const keypair: Keypair = {
        privateKey: [1, 2, 3, 4],
        publicKey: [5, 6, 7, 8],
      };
      const password = 'password123';

      const encrypted1 = await encryptKeypair(keypair, password);
      const encrypted2 = await encryptKeypair(keypair, password);

      // Encrypted data should be different (random IV and salt)
      expect(encrypted1.encryptedData).not.toBe(encrypted2.encryptedData);
      expect(encrypted1.salt).not.toBe(encrypted2.salt);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);

      // But both should decrypt to the same keypair
      const decrypted1 = await decryptKeypair(encrypted1, password);
      const decrypted2 = await decryptKeypair(encrypted2, password);

      expect(decrypted1).toEqual(keypair);
      expect(decrypted2).toEqual(keypair);
    });

    it('should handle large keypairs', async () => {
      // Simulate realistic RSA-2048 key sizes
      const largeKeypair: Keypair = {
        privateKey: Array.from({ length: 1200 }, (_, i) => i % 256),
        publicKey: Array.from({ length: 294 }, (_, i) => (i * 3) % 256),
      };
      const password = 'strongPassword!@#$';

      const encrypted = await encryptKeypair(largeKeypair, password);
      const decrypted = await decryptKeypair(encrypted, password);

      expect(decrypted).toEqual(largeKeypair);
    });
  });

  describe('LocalStorage operations', () => {
    it('should save and load encrypted keypair', async () => {
      const keypair: Keypair = {
        privateKey: [11, 22, 33],
        publicKey: [44, 55, 66],
      };
      const password = 'testPassword';
      const storageKey = 'test_keypair';

      // Encrypt and save
      const encrypted = await encryptKeypair(keypair, password);
      saveEncryptedKeypair(storageKey, encrypted);

      // Load and decrypt
      const loaded = loadEncryptedKeypair(storageKey);
      expect(loaded).toBeTruthy();

      if (loaded) {
        const decrypted = await decryptKeypair(loaded, password);
        expect(decrypted).toEqual(keypair);
      }
    });

    it('should return null for non-existent key', () => {
      const result = loadEncryptedKeypair('nonexistent_key');
      expect(result).toBeNull();
    });

    it('should clear encrypted keypair', async () => {
      const keypair: Keypair = {
        privateKey: [1, 2],
        publicKey: [3, 4],
      };
      const password = 'password';
      const storageKey = 'clear_test';

      const encrypted = await encryptKeypair(keypair, password);
      saveEncryptedKeypair(storageKey, encrypted);

      // Verify it exists
      expect(loadEncryptedKeypair(storageKey)).toBeTruthy();

      // Clear it
      removeEncryptedKeypair(storageKey);

      // Verify it's gone
      expect(loadEncryptedKeypair(storageKey)).toBeNull();
    });

    it('should handle multiple stored keypairs', async () => {
      const companyKeypair: Keypair = {
        privateKey: [10, 20],
        publicKey: [30, 40],
      };
      const employeeKeypair: Keypair = {
        privateKey: [50, 60],
        publicKey: [70, 80],
      };
      const password = 'samePassword';

      // Encrypt and save both
      const companyEncrypted = await encryptKeypair(companyKeypair, password);
      const employeeEncrypted = await encryptKeypair(employeeKeypair, password);

      saveEncryptedKeypair('company_keypair', companyEncrypted);
      saveEncryptedKeypair('employee_keypair', employeeEncrypted);

      // Load and verify both
      const companyLoaded = loadEncryptedKeypair('company_keypair');
      const employeeLoaded = loadEncryptedKeypair('employee_keypair');

      expect(companyLoaded).toBeTruthy();
      expect(employeeLoaded).toBeTruthy();

      if (companyLoaded && employeeLoaded) {
        const companyDecrypted = await decryptKeypair(companyLoaded, password);
        const employeeDecrypted = await decryptKeypair(employeeLoaded, password);

        expect(companyDecrypted).toEqual(companyKeypair);
        expect(employeeDecrypted).toEqual(employeeKeypair);
      }
    });
  });

  describe('Security properties', () => {
    it('should use different salt for each encryption', async () => {
      const keypair: Keypair = {
        privateKey: [1, 2, 3],
        publicKey: [4, 5, 6],
      };
      const password = 'password';

      const encrypted1 = await encryptKeypair(keypair, password);
      const encrypted2 = await encryptKeypair(keypair, password);

      expect(encrypted1.salt).not.toBe(encrypted2.salt);
    });

    it('should use different IV for each encryption', async () => {
      const keypair: Keypair = {
        privateKey: [1, 2, 3],
        publicKey: [4, 5, 6],
      };
      const password = 'password';

      const encrypted1 = await encryptKeypair(keypair, password);
      const encrypted2 = await encryptKeypair(keypair, password);

      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    it('should handle special characters in password', async () => {
      const keypair: Keypair = {
        privateKey: [1, 2, 3],
        publicKey: [4, 5, 6],
      };
      const password = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';

      const encrypted = await encryptKeypair(keypair, password);
      const decrypted = await decryptKeypair(encrypted, password);

      expect(decrypted).toEqual(keypair);
    });

    it('should handle unicode characters in password', async () => {
      const keypair: Keypair = {
        privateKey: [1, 2, 3],
        publicKey: [4, 5, 6],
      };
      const password = 'パスワード🔐密码';

      const encrypted = await encryptKeypair(keypair, password);
      const decrypted = await decryptKeypair(encrypted, password);

      expect(decrypted).toEqual(keypair);
    });

    it('should handle empty keypair arrays', async () => {
      const keypair: Keypair = {
        privateKey: [],
        publicKey: [],
      };
      const password = 'password';

      const encrypted = await encryptKeypair(keypair, password);
      const decrypted = await decryptKeypair(encrypted, password);

      expect(decrypted).toEqual(keypair);
    });
  });

  describe('Error handling', () => {
    it('should throw error for corrupted encrypted data', async () => {
      const corrupted: EncryptedData = {
        encryptedData: 'not-valid-base64!!!',
        salt: 'validBase64==',
        iv: 'validBase64==',
      };
      const password = 'password';

      await expect(decryptKeypair(corrupted, password)).rejects.toThrow();
    });

    it('should throw error for corrupted salt', async () => {
      const keypair: Keypair = {
        privateKey: [1, 2, 3],
        publicKey: [4, 5, 6],
      };
      const password = 'password';

      const encrypted = await encryptKeypair(keypair, password);

      const corrupted: EncryptedData = {
        ...encrypted,
        salt: 'corrupted!!!',
      };

      await expect(decryptKeypair(corrupted, password)).rejects.toThrow();
    });

    it('should throw error for corrupted IV', async () => {
      const keypair: Keypair = {
        privateKey: [1, 2, 3],
        publicKey: [4, 5, 6],
      };
      const password = 'password';

      const encrypted = await encryptKeypair(keypair, password);

      const corrupted: EncryptedData = {
        ...encrypted,
        iv: 'corrupted!!!',
      };

      await expect(decryptKeypair(corrupted, password)).rejects.toThrow();
    });
  });
});
