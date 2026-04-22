import { WalletService, InsufficientFundsError } from '../../src/services/WalletService';
import { DbClient } from '../../src/utils/db';

// ---------------------------------------------------------------------------
// Mock db interface
// ---------------------------------------------------------------------------
const mockQuery = jest.fn();
const mockTransaction = jest.fn();

const mockDb: DbClient = {
  query: mockQuery,
  transaction: mockTransaction,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeService(): WalletService {
  return new WalletService(mockDb);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('WalletService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // getGold
  // -------------------------------------------------------------------------
  describe('getGold', () => {
    it('returns gold balance from db.query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ gold: 5000 }], rowCount: 1 });
      const service = makeService();
      const balance = await service.getGold('user-uuid-1');
      expect(balance).toBe(5000);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT gold FROM user_wallets WHERE user_id=$1',
        ['user-uuid-1'],
      );
    });

    it('returns 0 when user has no wallet row', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const service = makeService();
      const balance = await service.getGold('no-wallet-user');
      expect(balance).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // debitGold
  // -------------------------------------------------------------------------
  describe('debitGold', () => {
    it('throws InsufficientFundsError when gold < betAmount', async () => {
      // The transaction callback receives a trx. We simulate it here:
      mockTransaction.mockImplementationOnce(async (callback: (trx: DbClient) => Promise<void>) => {
        const trx: DbClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [{ gold: 50 }], rowCount: 1 }), // SELECT gold
          transaction: jest.fn(),
        };
        await callback(trx);
      });

      const service = makeService();
      await expect(service.debitGold('user-1', 100)).rejects.toThrow(InsufficientFundsError);
    });

    it('does NOT call UPDATE when balance is insufficient (no partial debit)', async () => {
      const trxQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [{ gold: 10 }], rowCount: 1 }); // SELECT: only 10 gold

      // Transaction mock must re-throw so debitGold itself rejects
      mockTransaction.mockImplementationOnce(async (callback: (trx: DbClient) => Promise<void>) => {
        const trx: DbClient = { query: trxQuery, transaction: jest.fn() };
        await callback(trx); // let the InsufficientFundsError propagate
      });

      const service = makeService();
      await expect(service.debitGold('user-1', 100)).rejects.toThrow(InsufficientFundsError);
      // Only the SELECT FOR UPDATE should have been called; UPDATE should NOT be reached
      const updateCalls = trxQuery.mock.calls.filter((c: unknown[]) =>
        (c[0] as string).startsWith('UPDATE'),
      );
      expect(updateCalls).toHaveLength(0);
    });

    it('executes SELECT FOR UPDATE + UPDATE + INSERT in transaction on success', async () => {
      const trxQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [{ gold: 500 }], rowCount: 1 }) // SELECT gold
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })               // UPDATE gold
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });              // INSERT transaction

      mockTransaction.mockImplementationOnce(async (callback: (trx: DbClient) => Promise<void>) => {
        const trx: DbClient = { query: trxQuery, transaction: jest.fn() };
        await callback(trx);
      });

      const service = makeService();
      await service.debitGold('user-1', 100);

      expect(trxQuery).toHaveBeenCalledTimes(3);
      // First call: SELECT FOR UPDATE
      expect(trxQuery.mock.calls[0][0]).toMatch(/SELECT gold FROM user_wallets/);
      // Second call: UPDATE
      expect(trxQuery.mock.calls[1][0]).toMatch(/UPDATE user_wallets SET gold = gold - \$1/);
      // Third call: INSERT transactions
      expect(trxQuery.mock.calls[2][0]).toMatch(/INSERT INTO transactions/);
    });

    it('uses mocked db.query (does not call real database)', async () => {
      const trxQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [{ gold: 1000 }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      mockTransaction.mockImplementationOnce(async (callback: (trx: DbClient) => Promise<void>) => {
        const trx: DbClient = { query: trxQuery, transaction: jest.fn() };
        await callback(trx);
      });

      const service = makeService();
      await service.debitGold('user-42', 200);
      // The mock was called — no real DB was touched
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // creditGold
  // -------------------------------------------------------------------------
  describe('creditGold', () => {
    it('increases balance: executes UPDATE + INSERT in transaction', async () => {
      const trxQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })  // UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT

      mockTransaction.mockImplementationOnce(async (callback: (trx: DbClient) => Promise<void>) => {
        const trx: DbClient = { query: trxQuery, transaction: jest.fn() };
        await callback(trx);
      });

      const service = makeService();
      await service.creditGold('user-1', 500);
      expect(trxQuery).toHaveBeenCalledTimes(2);
      expect(trxQuery.mock.calls[0][0]).toMatch(/UPDATE user_wallets SET gold = gold \+ \$1/);
    });

    it('uses mocked db.query (does not call real database)', async () => {
      const trxQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      mockTransaction.mockImplementationOnce(async (callback: (trx: DbClient) => Promise<void>) => {
        const trx: DbClient = { query: trxQuery, transaction: jest.fn() };
        await callback(trx);
      });

      const service = makeService();
      await service.creditGold('user-99', 1000, 'earn');
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    it('defaults type to "earn" when not specified', async () => {
      const trxQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      mockTransaction.mockImplementationOnce(async (callback: (trx: DbClient) => Promise<void>) => {
        const trx: DbClient = { query: trxQuery, transaction: jest.fn() };
        await callback(trx);
      });

      const service = makeService();
      await service.creditGold('user-1', 100);
      const insertCall = trxQuery.mock.calls[1];
      expect(insertCall[1]).toContain('earn');
    });
  });

  // -------------------------------------------------------------------------
  // creditDiamond
  // -------------------------------------------------------------------------
  describe('creditDiamond', () => {
    it('is idempotent: no double-credit on duplicate receipt_hash', async () => {
      const trxQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'existing-receipt' }], rowCount: 1 }); // existing receipt

      mockTransaction.mockImplementationOnce(async (callback: (trx: DbClient) => Promise<void>) => {
        const trx: DbClient = { query: trxQuery, transaction: jest.fn() };
        await callback(trx);
      });

      const service = makeService();
      await service.creditDiamond('user-1', 100, 'hash-abc', 'apple', 'com.example.diamonds100');
      // Only SELECT iap_receipts should have been called; no INSERT/UPDATE after that
      expect(trxQuery).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // creditDiamond — non-idempotent path (new receipt)
  // -------------------------------------------------------------------------
  describe('creditDiamond — new receipt', () => {
    it('inserts receipt and credits diamond when receipt is new', async () => {
      const trxQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })   // SELECT: no existing receipt
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })   // INSERT iap_receipts
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })   // UPDATE user_wallets
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });  // INSERT transactions

      mockTransaction.mockImplementationOnce(async (callback: (trx: DbClient) => Promise<void>) => {
        const trx: DbClient = { query: trxQuery, transaction: jest.fn() };
        await callback(trx);
      });

      const service = makeService();
      await service.creditDiamond('user-1', 100, 'new-hash-xyz', 'apple', 'com.example.diamonds100');

      // Should have called 4 queries: SELECT + INSERT + UPDATE + INSERT
      expect(trxQuery).toHaveBeenCalledTimes(4);
      expect(trxQuery.mock.calls[1][0]).toMatch(/INSERT INTO iap_receipts/);
      expect(trxQuery.mock.calls[2][0]).toMatch(/UPDATE user_wallets SET diamond/);
    });
  });

  // -------------------------------------------------------------------------
  // InsufficientFundsError statusCode
  // -------------------------------------------------------------------------
  describe('InsufficientFundsError', () => {
    it('has statusCode 422', () => {
      const err = new InsufficientFundsError();
      expect(err.statusCode).toBe(422);
      expect(err.name).toBe('InsufficientFundsError');
    });

    it('supports custom message', () => {
      const err = new InsufficientFundsError('Not enough gold');
      expect(err.message).toBe('Not enough gold');
    });
  });

  // -------------------------------------------------------------------------
  // restoreDailyGold
  // -------------------------------------------------------------------------
  describe('restoreDailyGold', () => {
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
      process.env = { ...ORIGINAL_ENV };
    });

    afterEach(() => {
      process.env = ORIGINAL_ENV;
    });

    it('returns early (no-op) when DAILY_GOLD_THRESHOLD is 0 (disabled)', async () => {
      process.env.DAILY_GOLD_THRESHOLD = '0';
      process.env.DAILY_GOLD_AMOUNT = '100';
      const service = makeService();
      await service.restoreDailyGold();
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('returns early (no-op) when DAILY_GOLD_AMOUNT is 0 (disabled)', async () => {
      process.env.DAILY_GOLD_THRESHOLD = '500';
      process.env.DAILY_GOLD_AMOUNT = '0';
      const service = makeService();
      await service.restoreDailyGold();
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('returns early when neither env var is set (defaults to 0)', async () => {
      delete process.env.DAILY_GOLD_THRESHOLD;
      delete process.env.DAILY_GOLD_AMOUNT;
      const service = makeService();
      await service.restoreDailyGold();
      expect(mockTransaction).not.toHaveBeenCalled();
    });

    it('credits daily gold to eligible users when threshold and amount are set', async () => {
      process.env.DAILY_GOLD_THRESHOLD = '500';
      process.env.DAILY_GOLD_AMOUNT = '100';

      const trxQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-a' }, { user_id: 'user-b' }], rowCount: 2 }) // SELECT eligible
        .mockResolvedValueOnce({ rows: [], rowCount: 2 }) // UPDATE wallets
        .mockResolvedValueOnce({ rows: [], rowCount: 2 }); // INSERT transactions

      mockTransaction.mockImplementationOnce(async (callback: (trx: DbClient) => Promise<void>) => {
        const trx: DbClient = { query: trxQuery, transaction: jest.fn() };
        await callback(trx);
      });

      const service = makeService();
      await service.restoreDailyGold();

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(trxQuery).toHaveBeenCalledTimes(3);
      expect(trxQuery.mock.calls[1][0]).toMatch(/UPDATE user_wallets SET gold = gold \+ \$1/);
    });

    it('skips UPDATE when no eligible users found (rowCount = 0)', async () => {
      process.env.DAILY_GOLD_THRESHOLD = '500';
      process.env.DAILY_GOLD_AMOUNT = '100';

      const trxQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // SELECT: no eligible users

      mockTransaction.mockImplementationOnce(async (callback: (trx: DbClient) => Promise<void>) => {
        const trx: DbClient = { query: trxQuery, transaction: jest.fn() };
        await callback(trx);
      });

      const service = makeService();
      await service.restoreDailyGold();

      // Only 1 query (SELECT), no UPDATE or INSERT
      expect(trxQuery).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // flushBatch
  // -------------------------------------------------------------------------
  describe('flushBatch', () => {
    it('resolves without error (no-op in MVP)', async () => {
      const service = makeService();
      await expect(service.flushBatch()).resolves.toBeUndefined();
    });
  });
});
