/**
 * JWT verification utility.
 * Uses jsonwebtoken library. Throws if token is invalid or expired.
 *
 * Security:
 * - Algorithm is pinned to HS256 to prevent algorithm-confusion attacks.
 * - JWT_SECRET is required at startup; the process exits if absent rather
 *   than silently falling back to a known weak default.
 */
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required but not set.');
}

/** Pinned algorithm — prevents algorithm-confusion attacks (e.g. RS256 swap). */
const JWT_ALGORITHM: jwt.Algorithm = 'HS256';

export function verifyJwt(token: string): Record<string, unknown> {
  const payload = jwt.verify(token, JWT_SECRET as string, {
    algorithms: [JWT_ALGORITHM],
  });
  if (typeof payload === 'string') {
    throw new Error('invalid_token_format');
  }
  return payload as Record<string, unknown>;
}

export function signJwt(
  payload: Record<string, unknown>,
  expiresIn: string | number = '15m',
): string {
  return jwt.sign(payload, JWT_SECRET as string, {
    expiresIn,
    algorithm: JWT_ALGORITHM,
  } as jwt.SignOptions);
}
