/**
 * validate-env.ts — Startup environment validator
 *
 * Call validateEnvironment() as the first statement in your server entry point.
 * The function throws immediately if any required variable is absent or too short,
 * preventing the server from starting with an insecure configuration.
 *
 * Usage (src/index.ts or equivalent):
 *   import { validateEnvironment } from '../scripts/secrets/validate-env';
 *   validateEnvironment();
 */

const REQUIRED_ENV_VARS = [
  'JWT_SECRET',
  'DATABASE_URL',
  'REDIS_URL',
  'ENCRYPTION_KEY',
  'HMAC_SECRET_KEY',
  'NODE_ENV',
] as const;

type RequiredEnvVar = (typeof REQUIRED_ENV_VARS)[number];

/**
 * Minimum character-length requirements for secrets.
 * ENCRYPTION_KEY and HMAC_SECRET_KEY are hex-encoded 32-byte values,
 * so their minimum length is 64 characters (2 hex chars per byte).
 * JWT_SECRET is base64-encoded 32 bytes, minimum 32 characters.
 */
const MINIMUM_LENGTHS: Partial<Record<RequiredEnvVar, number>> = {
  JWT_SECRET: 32,
  ENCRYPTION_KEY: 64,
  HMAC_SECRET_KEY: 64,
};

const PLACEHOLDER_PATTERNS = [
  /^CHANGE_ME/i,
  /^REPLACE_ME/i,
  /^your[_-]/i,
  /^<.*>$/,
  /^TODO/i,
  /^PLACEHOLDER/i,
];

/**
 * Validate that the current process environment is safe to run the server.
 * Collects all errors and throws a single Error listing every problem found.
 */
export function validateEnvironment(): void {
  const errors: string[] = [];

  for (const varName of REQUIRED_ENV_VARS) {
    const value = process.env[varName];

    // Check presence
    if (value === undefined || value === '') {
      errors.push(`${varName}: missing or empty`);
      continue;
    }

    // Check for placeholder values
    for (const pattern of PLACEHOLDER_PATTERNS) {
      if (pattern.test(value)) {
        errors.push(
          `${varName}: contains placeholder value — run scripts/secrets/generate-secrets.sh to create real secrets`
        );
        break;
      }
    }

    // Check minimum length
    const minLength = MINIMUM_LENGTHS[varName as RequiredEnvVar];
    if (minLength !== undefined && value.length < minLength) {
      errors.push(
        `${varName}: too short (${value.length} chars, minimum ${minLength})`
      );
    }
  }

  // Validate NODE_ENV is a known value
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv && !['development', 'test', 'staging', 'production'].includes(nodeEnv)) {
    errors.push(`NODE_ENV: unknown value '${nodeEnv}' (expected: development | test | staging | production)`);
  }

  if (errors.length > 0) {
    const message = [
      'Environment validation failed — server startup aborted.',
      'Fix the following issues before starting the server:',
      ...errors.map((e) => `  - ${e}`),
      '',
      'See docs/SECRETS-GUIDE.md for setup instructions.',
    ].join('\n');
    throw new Error(message);
  }
}
