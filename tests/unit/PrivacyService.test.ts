import { PrivacyService } from '../../src/services/PrivacyService';
import { DbClient } from '../../src/utils/db';
import { secureRandomInt, encrypt, hmac, randomUUID } from '../../src/utils/crypto';

// ---------------------------------------------------------------------------
// Test environment setup
// Set a valid 32-byte hex key so AES-256-GCM in encrypt() doesn't throw.
// ---------------------------------------------------------------------------
beforeAll(() => {
  process.env.ENCRYPTION_KEY = '0'.repeat(64); // 32 bytes as hex
  process.env.HMAC_SECRET_KEY = 'test-hmac-secret';
});

// ---------------------------------------------------------------------------
// Mock db interface
// ---------------------------------------------------------------------------
const mockQuery = jest.fn();
const mockTransaction = jest.fn();

const mockDb: DbClient = {
  query: mockQuery,
  transaction: mockTransaction,
};

function makeService(): PrivacyService {
  return new PrivacyService(mockDb, 'test-hmac-secret');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('PrivacyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // requestDeletion
  // -------------------------------------------------------------------------
  describe('requestDeletion', () => {
    it('inserts deletion_request and updates user deletion_status to pending', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })  // INSERT deletion_requests
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE users

      const service = makeService();
      await service.requestDeletion('user-uuid-1');

      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[0][0]).toMatch(/INSERT INTO deletion_requests/);
      expect(mockQuery.mock.calls[0][0]).toMatch(/ON CONFLICT.*DO NOTHING/);
      expect(mockQuery.mock.calls[1][0]).toMatch(/UPDATE users/);
      expect(mockQuery.mock.calls[1][0]).toMatch(/deletion_status='pending'/);
    });
  });

  // -------------------------------------------------------------------------
  // cancelDeletion
  // -------------------------------------------------------------------------
  describe('cancelDeletion', () => {
    it('sets cancelled_at on deletion_requests and resets user status to active', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-uuid-1' }], rowCount: 1 }) // UPDATE deletion_requests
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });                           // UPDATE users

      const service = makeService();
      await service.cancelDeletion('user-uuid-1');

      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[0][0]).toMatch(/UPDATE deletion_requests/);
      expect(mockQuery.mock.calls[0][0]).toMatch(/cancelled_at = NOW\(\)/);
      expect(mockQuery.mock.calls[1][0]).toMatch(/UPDATE users/);
      expect(mockQuery.mock.calls[1][0]).toMatch(/deletion_status='active'/);
    });

    it('throws 409 error when deletion is already executed (rowCount === 0)', async () => {
      // rowCount=0 means either already executed or no pending request
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const service = makeService();
      const err = await service.cancelDeletion('user-uuid-1').catch(e => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as { statusCode?: number }).statusCode).toBe(409);
    });

    it('throws 409 when deletion is already cancelled (idempotency guard)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // no updatable row

      const service = makeService();
      const err = await service.cancelDeletion('user-uuid-1').catch(e => e);
      expect((err as { statusCode?: number }).statusCode).toBe(409);
    });
  });

  // -------------------------------------------------------------------------
  // executeScheduledDeletions
  // -------------------------------------------------------------------------
  describe('executeScheduledDeletions', () => {
    it('anonymises both email AND email_hash for each pending deletion', async () => {
      const pendingRows = [
        { user_id: 'user-aaa' },
        { user_id: 'user-bbb' },
      ];
      // First call: SELECT pending users
      mockQuery.mockResolvedValueOnce({ rows: pendingRows, rowCount: 2 });

      // For each user: transaction with UPDATE users + UPDATE deletion_requests
      const trxQuery1 = jest.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })  // UPDATE users (anonymise)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE deletion_requests (mark executed)

      const trxQuery2 = jest.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      let callIndex = 0;
      mockTransaction.mockImplementation(async (callback: (trx: DbClient) => Promise<void>) => {
        const trxQuery = callIndex === 0 ? trxQuery1 : trxQuery2;
        callIndex++;
        const trx: DbClient = { query: trxQuery, transaction: jest.fn() };
        await callback(trx);
      });

      const service = makeService();
      await service.executeScheduledDeletions();

      // SELECT was called once
      expect(mockQuery).toHaveBeenCalledTimes(1);
      // Two transactions were started (one per user)
      expect(mockTransaction).toHaveBeenCalledTimes(2);

      // Verify each transaction's UPDATE anonymises BOTH email AND email_hash
      for (const trxQuery of [trxQuery1, trxQuery2]) {
        const updateCall = trxQuery.mock.calls.find((c: unknown[]) =>
          (c[0] as string).includes('UPDATE users'),
        );
        expect(updateCall).toBeDefined();
        const sql = updateCall![0] as string;
        expect(sql).toMatch(/email = \$1/);
        expect(sql).toMatch(/email_hash = \$2/);
        expect(sql).toMatch(/deletion_status = 'deleted'/);
      }
    });

    it('marks deletion_requests as executed (sets executed_at)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-aaa' }], rowCount: 1 });

      const trxQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE users
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE deletion_requests

      mockTransaction.mockImplementationOnce(async (callback: (trx: DbClient) => Promise<void>) => {
        const trx: DbClient = { query: trxQuery, transaction: jest.fn() };
        await callback(trx);
      });

      const service = makeService();
      await service.executeScheduledDeletions();

      const execCall = trxQuery.mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes('UPDATE deletion_requests'),
      );
      expect(execCall).toBeDefined();
      expect(execCall![0]).toMatch(/executed_at=NOW\(\)/);
    });

    it('does nothing when there are no pending deletions', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // empty result

      const service = makeService();
      await service.executeScheduledDeletions();

      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('logs error and continues processing remaining users when one transaction fails', async () => {
      // Arrange: two pending users, first transaction fails, second succeeds
      const pendingRows = [{ user_id: 'user-fail' }, { user_id: 'user-ok' }];
      mockQuery.mockResolvedValueOnce({ rows: pendingRows, rowCount: 2 });

      const trxQueryOk = jest.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })  // UPDATE users
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE deletion_requests

      let callIndex = 0;
      mockTransaction.mockImplementation(async (callback: (trx: DbClient) => Promise<void>) => {
        if (callIndex === 0) {
          callIndex++;
          throw new Error('DB constraint violation for user-fail');
        }
        callIndex++;
        const trx: DbClient = { query: trxQueryOk, transaction: jest.fn() };
        await callback(trx);
      });

      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const service = makeService();
      // Should NOT throw — errors are caught per user
      await expect(service.executeScheduledDeletions()).resolves.toBeUndefined();

      // Error was logged for user-fail
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('user-fail'),
      );
      // Second user was still processed
      expect(trxQueryOk).toHaveBeenCalledTimes(2);
      errorSpy.mockRestore();
    });

    it('logs non-Error thrown values as String (err instanceof Error false branch)', async () => {
      // Arrange: one pending user, transaction throws a non-Error value (string)
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'user-str-err' }], rowCount: 1 });

      mockTransaction.mockImplementationOnce(async () => {
        // Throw a non-Error value (raw string — exercises String(err) branch)
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'raw string error';
      });

      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const service = makeService();
      await expect(service.executeScheduledDeletions()).resolves.toBeUndefined();

      // String(err) = 'raw string error'
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('raw string error'),
      );
      errorSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // JackpotManager — tested separately; Privacy focuses on PDPA compliance
  // -------------------------------------------------------------------------
});

// ---------------------------------------------------------------------------
// crypto utilities (secureRandomInt, encrypt, hmac)
// ---------------------------------------------------------------------------
describe('crypto utilities', () => {
  describe('secureRandomInt', () => {
    it('returns a non-negative integer less than max', () => {
      const result = secureRandomInt(100);
      expect(Number.isInteger(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(100);
    });

    it('throws when max is 0', () => {
      expect(() => secureRandomInt(0)).toThrow(/max must be a positive integer/);
    });

    it('throws when max is negative', () => {
      expect(() => secureRandomInt(-5)).toThrow(/max must be a positive integer/);
    });

    it('throws when max is a non-integer float', () => {
      expect(() => secureRandomInt(1.5)).toThrow(/max must be a positive integer/);
    });
  });

  describe('encrypt', () => {
    it('returns a non-empty base64 string for valid ENCRYPTION_KEY', () => {
      // ENCRYPTION_KEY already set in beforeAll to 64-char hex
      const ciphertext = encrypt('hello world');
      expect(typeof ciphertext).toBe('string');
      expect(ciphertext.length).toBeGreaterThan(0);
      // Valid base64: no error when decoded
      expect(() => Buffer.from(ciphertext, 'base64')).not.toThrow();
    });

    it('throws when ENCRYPTION_KEY is missing or too short', () => {
      const original = process.env.ENCRYPTION_KEY;
      process.env.ENCRYPTION_KEY = 'tooshort';
      expect(() => encrypt('test')).toThrow(/ENCRYPTION_KEY must be a 64-character hex string/);
      process.env.ENCRYPTION_KEY = original;
    });

    it('throws when ENCRYPTION_KEY env var is completely unset (undefined → empty string fallback)', () => {
      const original = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY; // triggers the ?? '' branch → length 0 ≠ 64
      expect(() => encrypt('test')).toThrow(/ENCRYPTION_KEY must be a 64-character hex string/);
      process.env.ENCRYPTION_KEY = original;
    });

    it('produces different ciphertext for the same plaintext (unique IV per call)', () => {
      const ct1 = encrypt('same plaintext');
      const ct2 = encrypt('same plaintext');
      // Unique IV ensures different ciphertext even for identical input
      expect(ct1).not.toBe(ct2);
    });
  });

  describe('hmac', () => {
    it('returns a non-empty hex string', () => {
      const result = hmac('email@example.com', 'secret');
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^[0-9a-f]+$/);
    });

    it('is deterministic for the same inputs', () => {
      const a = hmac('data', 'key');
      const b = hmac('data', 'key');
      expect(a).toBe(b);
    });

    it('produces different output for different data', () => {
      const a = hmac('email1@example.com', 'key');
      const b = hmac('email2@example.com', 'key');
      expect(a).not.toBe(b);
    });
  });

  describe('randomUUID', () => {
    it('returns a valid UUID v4 string', () => {
      const uuid = randomUUID();
      expect(typeof uuid).toBe('string');
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('returns unique UUIDs on each call', () => {
      const uuid1 = randomUUID();
      const uuid2 = randomUUID();
      expect(uuid1).not.toBe(uuid2);
    });
  });
});
