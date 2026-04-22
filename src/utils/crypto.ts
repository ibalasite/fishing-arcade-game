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
 * Returns a base64-encoded string: iv(12) + tag(16) + ciphertext.
 */
export function encrypt(plaintext: string): Buffer {
  const key = Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

/**
 * HMAC-SHA256 for deterministic email fingerprint (uniqueness enforcement without decryption).
 */
export function hmac(data: string, secret: string): Buffer {
  return crypto.createHmac('sha256', secret).update(data).digest();
}

export { randomUUID };
