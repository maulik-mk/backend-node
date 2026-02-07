/**
 * AES-256-GCM encryption for sensitive data at rest.
 *
 * @module Security/Utils
 * @since 1.0.0
 */

import crypto from 'node:crypto';
import { promisify } from 'node:util';

import { AppError } from '#common/errors/appError.js';
import env from '#config/env.js';

const ALGORITHM = 'aes-256-gcm';
let cachedKey: Buffer | null = null;

/**
 * Derives and caches encryption key using scrypt.
 */
const getKey = async (): Promise<Buffer> => {
   if (cachedKey) return cachedKey;

   const key = (await promisify(crypto.scrypt)(
      env.ENCRYPTION_DECRYPTION_SECRET,
      env.ENCRYPTION_DECRYPTION_SALT,
      32,
   )) as Buffer;

   cachedKey = key;
   return key;
};

/**
 * Encrypts plaintext using AES-256-GCM.
 *
 * @param text - Plaintext to encrypt
 * @returns Encrypted string as `iv:authTag:ciphertext` (hex)
 */
export const encrypt = async (text: string): Promise<string> => {
   const key = await getKey();
   const iv = crypto.randomBytes(12);
   const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

   let encrypted = cipher.update(text, 'utf8', 'hex');
   encrypted += cipher.final('hex');
   const authTag = cipher.getAuthTag().toString('hex');

   return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};

/**
 * Decrypts ciphertext produced by encrypt().
 *
 * @param text - Encrypted string as `iv:authTag:ciphertext`
 * @returns Original plaintext
 * @throws {AppError} If format is invalid or auth fails
 */
export const decrypt = async (text: string): Promise<string> => {
   const [ivHex, authTagHex, encryptedHex] = text.split(':');

   if (!ivHex || !authTagHex || !encryptedHex) {
      throw new AppError('Invalid encryption format or payload corrupted', 500);
   }

   const key = await getKey();
   const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
   decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

   let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
   decrypted += decipher.final('utf8');

   return decrypted;
};
