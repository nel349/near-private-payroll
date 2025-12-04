/**
 * Integration tests for the complete encryption flow
 * Tests the end-to-end encryption workflow from company onboarding through employee management
 */

import {
  generateRSAKeypair,
  encryptWithPublicKey,
  decryptWithPrivateKey,
} from '@near-private-payroll/sdk';
import {
  encryptKeypair,
  decryptKeypair,
  saveEncryptedKeypair,
  loadEncryptedKeypair,
  removeEncryptedKeypair,
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

describe('Encryption Integration Tests', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('Company Onboarding Flow', () => {
    it('should complete full company onboarding workflow', async () => {
      const companyPassword = 'SecureCompanyPassword123!';

      // Step 1: Generate RSA keypair for company
      const rsaKeypair = await generateRSAKeypair();

      expect(rsaKeypair.publicKey).toBeInstanceOf(Uint8Array);
      expect(rsaKeypair.privateKey).toBeInstanceOf(Uint8Array);
      expect(rsaKeypair.publicKey.length).toBeGreaterThan(250);
      expect(rsaKeypair.privateKey.length).toBeGreaterThan(1100);

      // Step 2: Convert to array format for storage
      const keypair: Keypair = {
        privateKey: Array.from(rsaKeypair.privateKey),
        publicKey: Array.from(rsaKeypair.publicKey),
      };

      // Step 3: Encrypt keypair with password
      const encryptedKeypair = await encryptKeypair(keypair, companyPassword);

      expect(encryptedKeypair.encryptedData).toBeTruthy();
      expect(encryptedKeypair.salt).toBeTruthy();
      expect(encryptedKeypair.iv).toBeTruthy();

      // Step 4: Save to localStorage
      saveEncryptedKeypair('company_keypair', encryptedKeypair);

      // Step 5: Verify can load and decrypt
      const loaded = loadEncryptedKeypair('company_keypair');
      expect(loaded).toBeTruthy();

      if (loaded) {
        const decrypted = await decryptKeypair(loaded, companyPassword);
        expect(decrypted).toEqual(keypair);
      }
    });

    it('should fail to decrypt with wrong password', async () => {
      const correctPassword = 'CorrectPassword123!';
      const wrongPassword = 'WrongPassword456!';

      const rsaKeypair = await generateRSAKeypair();
      const keypair: Keypair = {
        privateKey: Array.from(rsaKeypair.privateKey),
        publicKey: Array.from(rsaKeypair.publicKey),
      };

      const encryptedKeypair = await encryptKeypair(keypair, correctPassword);
      saveEncryptedKeypair('company_keypair', encryptedKeypair);

      const loaded = loadEncryptedKeypair('company_keypair');
      expect(loaded).toBeTruthy();

      if (loaded) {
        await expect(decryptKeypair(loaded, wrongPassword)).rejects.toThrow();
      }
    });
  });

  describe('Employee Management Flow', () => {
    it('should encrypt and decrypt employee name with company keypair', async () => {
      // Setup: Company generates and stores keypair
      const companyPassword = 'CompanyPass123!';
      const companyKeypair = await generateRSAKeypair();

      const storedKeypair: Keypair = {
        privateKey: Array.from(companyKeypair.privateKey),
        publicKey: Array.from(companyKeypair.publicKey),
      };

      const encrypted = await encryptKeypair(storedKeypair, companyPassword);
      saveEncryptedKeypair('company_keypair', encrypted);

      // Add employee: Encrypt name with company's public key
      const employeeName = 'Alice Johnson';
      const nameBytes = new TextEncoder().encode(employeeName);

      const encryptedName = await encryptWithPublicKey(
        nameBytes,
        companyKeypair.publicKey
      );

      expect(encryptedName).toBeInstanceOf(Uint8Array);
      expect(encryptedName).not.toEqual(nameBytes);

      // Later: Company loads keypair and decrypts name for display
      const loadedEncrypted = loadEncryptedKeypair('company_keypair');
      expect(loadedEncrypted).toBeTruthy();

      if (loadedEncrypted) {
        const loadedKeypair = await decryptKeypair(
          loadedEncrypted,
          companyPassword
        );

        const decryptedName = await decryptWithPrivateKey(
          encryptedName,
          new Uint8Array(loadedKeypair.privateKey),
          new Uint8Array(loadedKeypair.publicKey)
        );

        const decodedName = new TextDecoder().decode(decryptedName);
        expect(decodedName).toBe(employeeName);
      }
    });

    it('should encrypt salary with employee keypair (not company)', async () => {
      const employeeSalary = '75000.50';

      // Generate employee's keypair (not stored by company)
      const employeeKeypair = await generateRSAKeypair();

      // Encrypt salary with employee's public key
      const salaryBytes = new TextEncoder().encode(employeeSalary);
      const encryptedSalary = await encryptWithPublicKey(
        salaryBytes,
        employeeKeypair.publicKey
      );

      expect(encryptedSalary).toBeInstanceOf(Uint8Array);
      expect(encryptedSalary).not.toEqual(salaryBytes);

      // Employee can decrypt with their private key
      const decryptedSalary = await decryptWithPrivateKey(
        encryptedSalary,
        employeeKeypair.privateKey,
        employeeKeypair.publicKey
      );

      const decodedSalary = new TextDecoder().decode(decryptedSalary);
      expect(decodedSalary).toBe(employeeSalary);
    });
  });

  describe('Full Add Employee Flow', () => {
    it('should complete full employee addition workflow', async () => {
      // Setup: Company onboarding
      const companyPassword = 'CompanyPassword123!';
      const companyKeypair = await generateRSAKeypair();

      const storedCompanyKeypair: Keypair = {
        privateKey: Array.from(companyKeypair.privateKey),
        publicKey: Array.from(companyKeypair.publicKey),
      };

      const encryptedCompanyKeypair = await encryptKeypair(
        storedCompanyKeypair,
        companyPassword
      );
      saveEncryptedKeypair('company_keypair', encryptedCompanyKeypair);

      // Employee data
      const employeeName = 'Bob Smith';
      const employeeSalary = '60000';

      // Generate employee's keypair
      const employeeKeypair = await generateRSAKeypair();

      // Encrypt name with company's public key
      const nameBytes = new TextEncoder().encode(employeeName);
      const encryptedName = await encryptWithPublicKey(
        nameBytes,
        companyKeypair.publicKey
      );

      // Encrypt salary with employee's public key
      const salaryBytes = new TextEncoder().encode(employeeSalary);
      const encryptedSalary = await encryptWithPublicKey(
        salaryBytes,
        employeeKeypair.publicKey
      );

      // Store encrypted data (simulating contract storage)
      const employeeRecord = {
        encryptedName: Array.from(encryptedName),
        encryptedSalary: Array.from(encryptedSalary),
        employeePublicKey: Array.from(employeeKeypair.publicKey),
      };

      // Company views employee list: decrypt names
      const loadedCompanyEncrypted = loadEncryptedKeypair('company_keypair');
      expect(loadedCompanyEncrypted).toBeTruthy();

      if (loadedCompanyEncrypted) {
        const loadedCompanyKeypair = await decryptKeypair(
          loadedCompanyEncrypted,
          companyPassword
        );

        // Decrypt name for display
        const decryptedNameBytes = await decryptWithPrivateKey(
          new Uint8Array(employeeRecord.encryptedName),
          new Uint8Array(loadedCompanyKeypair.privateKey),
          new Uint8Array(loadedCompanyKeypair.publicKey)
        );

        const displayName = new TextDecoder().decode(decryptedNameBytes);
        expect(displayName).toBe(employeeName);

        // Company CANNOT decrypt salary (wrong key)
        await expect(
          decryptWithPrivateKey(
            new Uint8Array(employeeRecord.encryptedSalary),
            new Uint8Array(loadedCompanyKeypair.privateKey),
            new Uint8Array(loadedCompanyKeypair.publicKey)
          )
        ).rejects.toThrow();
      }

      // Employee can decrypt their salary
      const decryptedSalaryBytes = await decryptWithPrivateKey(
        new Uint8Array(employeeRecord.encryptedSalary),
        employeeKeypair.privateKey,
        employeeKeypair.publicKey
      );

      const actualSalary = new TextDecoder().decode(decryptedSalaryBytes);
      expect(actualSalary).toBe(employeeSalary);
    });
  });

  describe('Multiple Employees Flow', () => {
    it('should handle multiple employees with separate encryption', async () => {
      // Company setup
      const companyPassword = 'CompanyPass123!';
      const companyKeypair = await generateRSAKeypair();

      const storedCompanyKeypair: Keypair = {
        privateKey: Array.from(companyKeypair.privateKey),
        publicKey: Array.from(companyKeypair.publicKey),
      };

      const encryptedCompanyKeypair = await encryptKeypair(
        storedCompanyKeypair,
        companyPassword
      );
      saveEncryptedKeypair('company_keypair', encryptedCompanyKeypair);

      // Add multiple employees
      const employees = [
        { name: 'Alice Johnson', salary: '75000' },
        { name: 'Bob Smith', salary: '60000' },
        { name: 'Carol Williams', salary: '85000' },
      ];

      const employeeRecords = [];

      for (const emp of employees) {
        // Generate employee keypair
        const employeeKeypair = await generateRSAKeypair();

        // Encrypt name with company's key
        const nameBytes = new TextEncoder().encode(emp.name);
        const encryptedName = await encryptWithPublicKey(
          nameBytes,
          companyKeypair.publicKey
        );

        // Encrypt salary with employee's key
        const salaryBytes = new TextEncoder().encode(emp.salary);
        const encryptedSalary = await encryptWithPublicKey(
          salaryBytes,
          employeeKeypair.publicKey
        );

        employeeRecords.push({
          originalName: emp.name,
          originalSalary: emp.salary,
          encryptedName: Array.from(encryptedName),
          encryptedSalary: Array.from(encryptedSalary),
          employeePrivateKey: employeeKeypair.privateKey,
          employeePublicKey: employeeKeypair.publicKey,
        });
      }

      // Company loads keypair and decrypts all names
      const loadedCompanyEncrypted = loadEncryptedKeypair('company_keypair');
      expect(loadedCompanyEncrypted).toBeTruthy();

      if (loadedCompanyEncrypted) {
        const loadedCompanyKeypair = await decryptKeypair(
          loadedCompanyEncrypted,
          companyPassword
        );

        // Decrypt all names
        const decryptedNames = await Promise.all(
          employeeRecords.map(async (record) => {
            const decryptedNameBytes = await decryptWithPrivateKey(
              new Uint8Array(record.encryptedName),
              new Uint8Array(loadedCompanyKeypair.privateKey),
              new Uint8Array(loadedCompanyKeypair.publicKey)
            );
            return new TextDecoder().decode(decryptedNameBytes);
          })
        );

        // Verify all names decrypted correctly
        expect(decryptedNames).toEqual(
          employees.map((emp) => emp.name)
        );

        // Each employee can decrypt their own salary
        for (let i = 0; i < employeeRecords.length; i++) {
          const record = employeeRecords[i];

          const decryptedSalaryBytes = await decryptWithPrivateKey(
            new Uint8Array(record.encryptedSalary),
            record.employeePrivateKey,
            record.employeePublicKey
          );

          const salary = new TextDecoder().decode(decryptedSalaryBytes);
          expect(salary).toBe(record.originalSalary);
        }
      }
    });
  });

  describe('Security Properties', () => {
    it('should maintain encryption security across page refresh simulation', async () => {
      const companyPassword = 'CompanyPass123!';
      const employeeName = 'Test Employee';

      // Session 1: Company onboarding and add employee
      const companyKeypair = await generateRSAKeypair();
      const storedKeypair: Keypair = {
        privateKey: Array.from(companyKeypair.privateKey),
        publicKey: Array.from(companyKeypair.publicKey),
      };

      const encrypted = await encryptKeypair(storedKeypair, companyPassword);
      saveEncryptedKeypair('company_keypair', encrypted);

      const nameBytes = new TextEncoder().encode(employeeName);
      const encryptedName = await encryptWithPublicKey(
        nameBytes,
        companyKeypair.publicKey
      );

      // Simulate page refresh - clear in-memory state but keep localStorage
      const savedEncryptedName = Array.from(encryptedName);

      // Session 2: Load from storage and decrypt
      const loadedEncrypted = loadEncryptedKeypair('company_keypair');
      expect(loadedEncrypted).toBeTruthy();

      if (loadedEncrypted) {
        const loadedKeypair = await decryptKeypair(
          loadedEncrypted,
          companyPassword
        );

        const decryptedNameBytes = await decryptWithPrivateKey(
          new Uint8Array(savedEncryptedName),
          new Uint8Array(loadedKeypair.privateKey),
          new Uint8Array(loadedKeypair.publicKey)
        );

        const decodedName = new TextDecoder().decode(decryptedNameBytes);
        expect(decodedName).toBe(employeeName);
      }
    });

    it('should protect data even with localStorage access', async () => {
      const companyPassword = 'SecurePassword123!';
      const employeeName = 'Confidential Employee';

      const companyKeypair = await generateRSAKeypair();
      const storedKeypair: Keypair = {
        privateKey: Array.from(companyKeypair.privateKey),
        publicKey: Array.from(companyKeypair.publicKey),
      };

      const encrypted = await encryptKeypair(storedKeypair, companyPassword);
      saveEncryptedKeypair('company_keypair', encrypted);

      // Even if attacker has localStorage access, they can't decrypt without password
      const stolenData = loadEncryptedKeypair('company_keypair');
      expect(stolenData).toBeTruthy();

      if (stolenData) {
        // Wrong password should fail
        await expect(
          decryptKeypair(stolenData, 'WrongPassword')
        ).rejects.toThrow();

        // Correct password should work
        const decrypted = await decryptKeypair(stolenData, companyPassword);
        expect(decrypted.privateKey).toEqual(storedKeypair.privateKey);
      }
    });

    it('should cleanup encrypted data on logout', async () => {
      const companyPassword = 'Password123!';

      const companyKeypair = await generateRSAKeypair();
      const storedKeypair: Keypair = {
        privateKey: Array.from(companyKeypair.privateKey),
        publicKey: Array.from(companyKeypair.publicKey),
      };

      const encrypted = await encryptKeypair(storedKeypair, companyPassword);
      saveEncryptedKeypair('company_keypair', encrypted);

      // Verify stored
      expect(loadEncryptedKeypair('company_keypair')).toBeTruthy();

      // Simulate logout
      removeEncryptedKeypair('company_keypair');

      // Verify removed
      expect(loadEncryptedKeypair('company_keypair')).toBeNull();
    });
  });
});
