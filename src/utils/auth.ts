/**
 * JWT verification utility.
 * Uses jsonwebtoken library. Throws if token is invalid or expired.
 */
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'change-me-in-production';

export function verifyJwt(token: string): Record<string, unknown> {
  const payload = jwt.verify(token, JWT_SECRET);
  if (typeof payload === 'string') {
    throw new Error('invalid_token_format');
  }
  return payload as Record<string, unknown>;
}

export function signJwt(
  payload: Record<string, unknown>,
  expiresIn: string | number = '15m',
): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}
