import { PrivacyService } from '../../src/services/PrivacyService';
import { DbClient } from '../../src/utils/db';

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
  });

  // -------------------------------------------------------------------------
  // JackpotManager — tested separately; Privacy focuses on PDPA compliance
  // -------------------------------------------------------------------------
});
