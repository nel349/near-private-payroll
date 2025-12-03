/**
 * Tests for cryptographic functions
 */

import {
  generateBlinding,
  generateCommitment,
  verifyCommitment,
  generateSalaryCommitment,
  generateRSAKeypair,
  encryptWithPublicKey,
  decryptWithPrivateKey,
  toHex,
  fromHex,
} from './crypto';

describe('Crypto Utilities', () => {
  describe('generateBlinding', () => {
    it('should generate 32 random bytes', () => {
      const blinding = generateBlinding();
      expect(blinding).toBeInstanceOf(Uint8Array);
      expect(blinding.length).toBe(32);
    });

    it('should generate different values on each call', () => {
      const blinding1 = generateBlinding();
      const blinding2 = generateBlinding();
      expect(blinding1).not.toEqual(blinding2);
    });
  });

  describe('Commitment generation and verification', () => {
    it('should generate valid commitment for a value', () => {
      const value = BigInt(1000);
      const commitment = generateCommitment(value);

      expect(commitment.value).toBeInstanceOf(Uint8Array);
      expect(commitment.value.length).toBe(32);
      expect(commitment.blinding).toBeInstanceOf(Uint8Array);
      expect(commitment.blinding.length).toBe(32);
    });

    it('should verify valid commitment', () => {
      const value = BigInt(5000);
      const commitment = generateCommitment(value);

      const isValid = verifyCommitment(
        commitment.value,
        value,
        commitment.blinding
      );

      expect(isValid).toBe(true);
    });

    it('should reject commitment with wrong value', () => {
      const value = BigInt(1000);
      const wrongValue = BigInt(2000);
      const commitment = generateCommitment(value);

      const isValid = verifyCommitment(
        commitment.value,
        wrongValue,
        commitment.blinding
      );

      expect(isValid).toBe(false);
    });

    it('should reject commitment with wrong blinding', () => {
      const value = BigInt(1000);
      const commitment = generateCommitment(value);
      const wrongBlinding = generateBlinding();

      const isValid = verifyCommitment(
        commitment.value,
        value,
        wrongBlinding
      );

      expect(isValid).toBe(false);
    });

    it('should generate salary commitment with correct domain', () => {
      const salary = BigInt(50000);
      const commitment = generateSalaryCommitment(salary);

      expect(commitment.value).toBeInstanceOf(Uint8Array);
      expect(commitment.value.length).toBe(32);
    });
  });

  describe('Hex conversion', () => {
    it('should convert Uint8Array to hex string', () => {
      const bytes = new Uint8Array([0, 1, 2, 15, 16, 255]);
      const hex = toHex(bytes);

      expect(hex).toBe('0001020f10ff');
    });

    it('should convert hex string to Uint8Array', () => {
      const hex = '0001020f10ff';
      const bytes = fromHex(hex);

      expect(bytes).toEqual(new Uint8Array([0, 1, 2, 15, 16, 255]));
    });

    it('should round-trip hex conversion', () => {
      const original = new Uint8Array([10, 20, 30, 40, 50]);
      const hex = toHex(original);
      const restored = fromHex(hex);

      expect(restored).toEqual(original);
    });
  });

  describe('RSA Keypair Generation', () => {
    it('should generate RSA keypair', async () => {
      const keypair = await generateRSAKeypair();

      expect(keypair.publicKey).toBeInstanceOf(Uint8Array);
      expect(keypair.privateKey).toBeInstanceOf(Uint8Array);

      // SPKI public key format is ~294 bytes for RSA-2048
      expect(keypair.publicKey.length).toBeGreaterThan(250);
      expect(keypair.publicKey.length).toBeLessThan(350);

      // PKCS8 private key format is ~1200+ bytes for RSA-2048
      expect(keypair.privateKey.length).toBeGreaterThan(1100);
      expect(keypair.privateKey.length).toBeLessThan(1300);
    });

    it('should generate different keypairs on each call', async () => {
      const keypair1 = await generateRSAKeypair();
      const keypair2 = await generateRSAKeypair();

      expect(keypair1.publicKey).not.toEqual(keypair2.publicKey);
      expect(keypair1.privateKey).not.toEqual(keypair2.privateKey);
    });
  });

  describe('RSA Encryption/Decryption', () => {
    it('should encrypt and decrypt data correctly', async () => {
      const originalData = new TextEncoder().encode('Hello, NEAR!');
      const keypair = await generateRSAKeypair();

      // Encrypt with public key
      const encrypted = await encryptWithPublicKey(originalData, keypair.publicKey);

      // Verify encrypted data is different from original
      expect(encrypted).not.toEqual(originalData);
      expect(encrypted.length).toBeGreaterThan(0);

      // Decrypt with private key
      const decrypted = await decryptWithPrivateKey(
        encrypted,
        keypair.privateKey,
        keypair.publicKey
      );

      // Verify decrypted data matches original
      expect(decrypted).toEqual(originalData);
      expect(new TextDecoder().decode(decrypted)).toBe('Hello, NEAR!');
    });

    it('should handle empty data', async () => {
      const originalData = new Uint8Array(0);
      const keypair = await generateRSAKeypair();

      const encrypted = await encryptWithPublicKey(originalData, keypair.publicKey);
      const decrypted = await decryptWithPrivateKey(
        encrypted,
        keypair.privateKey,
        keypair.publicKey
      );

      expect(decrypted).toEqual(originalData);
    });

    it('should handle various data sizes', async () => {
      const keypair = await generateRSAKeypair();

      // Test different sizes (RSA-2048 can encrypt up to 190 bytes with OAEP padding)
      const sizes = [1, 10, 50, 100, 150];

      for (const size of sizes) {
        const data = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
          data[i] = i % 256;
        }

        const encrypted = await encryptWithPublicKey(data, keypair.publicKey);
        const decrypted = await decryptWithPrivateKey(
          encrypted,
          keypair.privateKey,
          keypair.publicKey
        );

        expect(decrypted).toEqual(data);
      }
    });

    it('should produce different ciphertexts for same data (non-deterministic)', async () => {
      const data = new TextEncoder().encode('Same message');
      const keypair = await generateRSAKeypair();

      const encrypted1 = await encryptWithPublicKey(data, keypair.publicKey);
      const encrypted2 = await encryptWithPublicKey(data, keypair.publicKey);

      // RSA-OAEP includes random padding, so ciphertexts should differ
      expect(encrypted1).not.toEqual(encrypted2);

      // But both should decrypt to the same plaintext
      const decrypted1 = await decryptWithPrivateKey(
        encrypted1,
        keypair.privateKey,
        keypair.publicKey
      );
      const decrypted2 = await decryptWithPrivateKey(
        encrypted2,
        keypair.privateKey,
        keypair.publicKey
      );

      expect(decrypted1).toEqual(data);
      expect(decrypted2).toEqual(data);
    });

    it('should fail to decrypt with wrong private key', async () => {
      const data = new TextEncoder().encode('Secret data');
      const keypair1 = await generateRSAKeypair();
      const keypair2 = await generateRSAKeypair();

      const encrypted = await encryptWithPublicKey(data, keypair1.publicKey);

      // Try to decrypt with wrong private key
      await expect(
        decryptWithPrivateKey(encrypted, keypair2.privateKey, keypair2.publicKey)
      ).rejects.toThrow();
    });

    it('should encrypt employee name scenario', async () => {
      const employeeName = 'Alice Johnson';
      const nameBytes = new TextEncoder().encode(employeeName);

      // Company keypair
      const companyKeypair = await generateRSAKeypair();

      // Encrypt with company's public key
      const encryptedName = await encryptWithPublicKey(
        nameBytes,
        companyKeypair.publicKey
      );

      // Decrypt with company's private key
      const decryptedNameBytes = await decryptWithPrivateKey(
        encryptedName,
        companyKeypair.privateKey,
        companyKeypair.publicKey
      );

      const decryptedName = new TextDecoder().decode(decryptedNameBytes);

      expect(decryptedName).toBe(employeeName);
    });

    it('should encrypt employee salary scenario', async () => {
      const salary = '75000.50';
      const salaryBytes = new TextEncoder().encode(salary);

      // Employee keypair
      const employeeKeypair = await generateRSAKeypair();

      // Encrypt with employee's public key (company encrypts)
      const encryptedSalary = await encryptWithPublicKey(
        salaryBytes,
        employeeKeypair.publicKey
      );

      // Decrypt with employee's private key (employee decrypts)
      const decryptedSalaryBytes = await decryptWithPrivateKey(
        encryptedSalary,
        employeeKeypair.privateKey,
        employeeKeypair.publicKey
      );

      const decryptedSalary = new TextDecoder().decode(decryptedSalaryBytes);

      expect(decryptedSalary).toBe(salary);
    });
  });

  describe('Cross-entity encryption', () => {
    it('should allow company to decrypt names but not salaries', async () => {
      const employeeName = 'Bob Smith';
      const salary = '60000';

      // Generate keypairs
      const companyKeypair = await generateRSAKeypair();
      const employeeKeypair = await generateRSAKeypair();

      // Encrypt name with company's key
      const encryptedName = await encryptWithPublicKey(
        new TextEncoder().encode(employeeName),
        companyKeypair.publicKey
      );

      // Encrypt salary with employee's key
      const encryptedSalary = await encryptWithPublicKey(
        new TextEncoder().encode(salary),
        employeeKeypair.publicKey
      );

      // Company can decrypt name
      const decryptedName = await decryptWithPrivateKey(
        encryptedName,
        companyKeypair.privateKey,
        companyKeypair.publicKey
      );
      expect(new TextDecoder().decode(decryptedName)).toBe(employeeName);

      // Company CANNOT decrypt salary (wrong key)
      await expect(
        decryptWithPrivateKey(
          encryptedSalary,
          companyKeypair.privateKey,
          companyKeypair.publicKey
        )
      ).rejects.toThrow();

      // Employee can decrypt salary
      const decryptedSalary = await decryptWithPrivateKey(
        encryptedSalary,
        employeeKeypair.privateKey,
        employeeKeypair.publicKey
      );
      expect(new TextDecoder().decode(decryptedSalary)).toBe(salary);
    });
  });
});
