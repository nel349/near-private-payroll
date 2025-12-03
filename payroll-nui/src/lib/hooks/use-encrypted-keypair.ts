/**
 * Hook for managing encrypted keypair access with password prompts
 */

import { useState, useCallback } from 'react';
import {
  loadEncryptedKeypair,
  decryptKeypair,
  keypairCache,
  type Keypair,
} from '@/lib/secure-storage';

export function useEncryptedKeypair(storageKey: string) {
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [keypair, setKeypair] = useState<Keypair | null>(null);

  /**
   * Attempt to get the keypair from cache or prompt for password
   */
  const getKeypair = useCallback(
    async (password?: string): Promise<Keypair | null> => {
      // Check cache first
      if (keypairCache.has(storageKey)) {
        const cached = keypairCache.get(storageKey)!;
        setKeypair(cached);
        return cached;
      }

      // If no password provided, need to show prompt
      if (!password) {
        setShowPasswordPrompt(true);
        return null;
      }

      // Try to decrypt with provided password
      setIsDecrypting(true);
      setDecryptError(null);

      try {
        const encrypted = loadEncryptedKeypair(storageKey);
        if (!encrypted) {
          throw new Error('No encrypted keypair found');
        }

        const decrypted = await decryptKeypair(encrypted, password);

        // Cache for session
        keypairCache.set(storageKey, decrypted);
        setKeypair(decrypted);
        setShowPasswordPrompt(false);

        return decrypted;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to decrypt keypair';
        setDecryptError(errorMessage);
        throw error;
      } finally {
        setIsDecrypting(false);
      }
    },
    [storageKey]
  );

  /**
   * Handle password submission from dialog
   */
  const handlePasswordSubmit = useCallback(
    async (password: string) => {
      await getKeypair(password);
    },
    [getKeypair]
  );

  /**
   * Cancel password prompt
   */
  const handleCancel = useCallback(() => {
    setShowPasswordPrompt(false);
    setDecryptError(null);
  }, []);

  /**
   * Clear cached keypair
   */
  const clearKeypair = useCallback(() => {
    keypairCache.remove(storageKey);
    setKeypair(null);
  }, [storageKey]);

  return {
    keypair,
    showPasswordPrompt,
    isDecrypting,
    decryptError,
    getKeypair,
    handlePasswordSubmit,
    handleCancel,
    clearKeypair,
  };
}
