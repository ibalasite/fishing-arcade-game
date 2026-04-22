import crypto from 'crypto';
import { randomUUID } from 'crypto';

/**
 * CSPRNG wrapper for game-critical random values.
 * Uses crypto.randomInt() for uniform integer distribution without floating-point bias.
 */
export function secureRandomInt(max: number): number {
  return crypto.randomInt(max);
}

/**
 * AES-256-GCM encryption for PII fields (email).
 *
 * Returns a base64-encoded string: iv(12) + tag(16) + ciphertext.
 * Base64 string is safe to store in a TEXT/VARCHAR database column.
 *
 * A unique 12-byte IV is generated for every call (CSPRNG) to prevent
 * IV reuse, which would compromise AES-GCM confidentiality.
 *
 * Key validation: ENCRYPTION_KEY must be a 64-hex-character string
 * (32 bytes) at startup — a missing or short key will throw immediately.
 */
export function encrypt(plaintext: string): string {
  const keyHex = process.env.ENCRYPTION_KEY ?? '';
  if (keyHex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
  }
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(12); // unique per encryption — never reuse IV with AES-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * HMAC-SHA256 for deterministic email fingerprint (uniqueness enforcement without decryption).
 */
export function hmac(data: string, secret: string): Buffer {
  return crypto.createHmac('sha256', secret).update(data).digest();
}

export { randomUUID };
