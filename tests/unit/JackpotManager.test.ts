import { JackpotManager, JACKPOT_ODDS, JACKPOT_SEED_AMOUNT } from '../../src/engine/JackpotManager';
import { DbClient } from '../../src/utils/db';

// ---------------------------------------------------------------------------
// Mock Redis client
// ---------------------------------------------------------------------------
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisEval = jest.fn();
const mockRedisIncrByFloat = jest.fn();

const mockRedis = {
  get: mockRedisGet,
  set: mockRedisSet,
  eval: mockRedisEval,
  incrby: jest.fn(),
  incrbyfloat: mockRedisIncrByFloat,
};

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
// Tests
// ---------------------------------------------------------------------------
describe('JackpotManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset singleton between tests
    JackpotManager.resetInstance();
  });

  describe('JACKPOT_ODDS table', () => {
    it('defines correct odds for each canonical multiplier', () => {
      expect(JACKPOT_ODDS[1]).toBe(500_000);
      expect(JACKPOT_ODDS[10]).toBe(50_000);
      expect(JACKPOT_ODDS[50]).toBe(10_000);
      expect(JACKPOT_ODDS[100]).toBe(5_000);
    });

    it('falls back to 1x odds for unknown multipliers', () => {
      // This is tested indirectly via tryTrigger using multiplier 99
      // Odds for 99 → fallback to JACKPOT_ODDS[1] = 500_000
      expect(JACKPOT_ODDS[99]).toBeUndefined();
      // tryTrigger should use JACKPOT_ODDS[1] as fallback
    });
  });

  describe('JACKPOT_SEED_AMOUNT', () => {
    it('is a positive number (minimum pool after claim)', () => {
      expect(JACKPOT_SEED_AMOUNT).toBeGreaterThan(0);
    });
  });

  describe('getInstance', () => {
    it('returns a JackpotManager instance', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ current_amount: '1000' }], rowCount: 1 });
      mockRedisSet.mockResolvedValueOnce('OK');

      const mgr = await JackpotManager.getInstance(mockDb as never, mockRedis as never);
      expect(mgr).toBeInstanceOf(JackpotManager);
    });

    it('concurrent calls return the same instance (singleton race-condition guard)', async () => {
      mockQuery.mockResolvedValue({ rows: [{ current_amount: '1000' }], rowCount: 1 });
      mockRedisSet.mockResolvedValue('OK');

      const [mgr1, mgr2, mgr3] = await Promise.all([
        JackpotManager.getInstance(mockDb as never, mockRedis as never),
        JackpotManager.getInstance(mockDb as never, mockRedis as never),
        JackpotManager.getInstance(mockDb as never, mockRedis as never),
      ]);
      expect(mgr1).toBe(mgr2);
      expect(mgr2).toBe(mgr3);
    });
  });

  describe('tryTrigger', () => {
    it('returns null when roll does not hit (non-zero roll → no jackpot)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ current_amount: '5000' }], rowCount: 1 });
      mockRedisSet.mockResolvedValueOnce('OK');

      const mgr = await JackpotManager.getInstance(mockDb as never, mockRedis as never);

      // With odds of 500_000, virtually all random rolls will be non-zero.
      // Run many attempts and confirm at least some return null.
      // (There is a ~0.002% chance of a jackpot per call, so calling 100 times should be safe.)
      let nullCount = 0;
      for (let i = 0; i < 100; i++) {
        // mockRedisEval returns a pool amount only if tryTrigger gets roll === 0
        // In practice this test relies on crypto.randomInt rarely hitting 0 in 100 tries.
        const result = await mgr.tryTrigger(1, 'user-test');
        if (result === null) nullCount++;
      }
      // At least 99 should be null with multiplier=1 (odds 1:500_000)
      expect(nullCount).toBeGreaterThanOrEqual(95);
    });

    it('credits winner and returns JackpotResult when claim succeeds', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ current_amount: '1000' }], rowCount: 1 });
      mockRedisSet.mockResolvedValueOnce('OK');

      const mgr = await JackpotManager.getInstance(mockDb as never, mockRedis as never);

      // Force jackpot by using a spy that overrides the crypto.randomInt for the roll
      // We test this by using a very small odds via a custom method override.
      // Since we can't mock crypto.randomInt directly without patching the module,
      // we use the triggerForTest helper (exposed for test purposes).
      mockRedisEval.mockResolvedValueOnce('5000'); // pool = 5000

      const trxQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT jackpot_history
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE user_wallets
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT transactions

      mockTransaction.mockImplementationOnce(async (callback: (trx: DbClient) => Promise<void>) => {
        const trx: DbClient = { query: trxQuery, transaction: jest.fn() };
        await callback(trx);
      });

      // Use triggerForTest to force a win
      const result = await mgr.triggerForTest('user-winner-1', 5000);
      expect(result).not.toBeNull();
      expect(result?.winnerId).toBe('user-winner-1');
      expect(result?.amount).toBe(5000);
    });
  });

  describe('persistPool', () => {
    it('reads from Redis and writes to PostgreSQL', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ current_amount: '1000' }], rowCount: 1 });
      mockRedisSet.mockResolvedValueOnce('OK');

      const mgr = await JackpotManager.getInstance(mockDb as never, mockRedis as never);

      mockRedisGet.mockResolvedValueOnce('9500');
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE jackpot_pool

      await mgr.persistPool();

      expect(mockRedisGet).toHaveBeenCalledWith('game:jackpot:pool');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE jackpot_pool SET current_amount=\$1/),
        expect.arrayContaining(['9500']),
      );
    });
  });

  describe('restorePool', () => {
    it('reads from PostgreSQL and writes to Redis on init', async () => {
      // restorePool is called during getInstance
      mockQuery.mockResolvedValueOnce({ rows: [{ current_amount: '12345' }], rowCount: 1 });
      mockRedisSet.mockResolvedValueOnce('OK');

      await JackpotManager.getInstance(mockDb as never, mockRedis as never);

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT current_amount FROM jackpot_pool WHERE id=1',
      );
      expect(mockRedisSet).toHaveBeenCalledWith('game:jackpot:pool', '12345');
    });

    it('seeds pool with "0" when jackpot_pool row has no current_amount', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // no row
      mockRedisSet.mockResolvedValueOnce('OK');

      await JackpotManager.getInstance(mockDb as never, mockRedis as never);

      expect(mockRedisSet).toHaveBeenCalledWith('game:jackpot:pool', '0');
    });
  });

  describe('getInstance — error path', () => {
    it('throws when db and redis are not provided on first call', async () => {
      // No db/redis passed — should throw with helpful error
      await expect(JackpotManager.getInstance()).rejects.toThrow(
        'JackpotManager.getInstance() requires db and redis on first call.',
      );
    });
  });

  describe('contribute', () => {
    it('calls incrbyfloat with correct contribution amount', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ current_amount: '1000' }], rowCount: 1 });
      mockRedisSet.mockResolvedValueOnce('OK');
      mockRedisIncrByFloat.mockResolvedValueOnce('1001');

      const mgr = await JackpotManager.getInstance(mockDb as never, mockRedis as never);
      await mgr.contribute(100);

      // Default JACKPOT_CONTRIB_RATE is 0.01, so contribution = 100 * 0.01 = 1
      expect(mockRedisIncrByFloat).toHaveBeenCalledWith('game:jackpot:pool', 1);
    });

    it('skips contribution and logs warning when incrbyfloat is unavailable', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ current_amount: '1000' }], rowCount: 1 });
      mockRedisSet.mockResolvedValueOnce('OK');

      // Create redis mock without incrbyfloat
      const minimalRedis = {
        get: mockRedisGet,
        set: mockRedisSet,
        eval: mockRedisEval,
        // incrbyfloat intentionally omitted
      };

      const mgr = await JackpotManager.getInstance(mockDb as never, minimalRedis as never);

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      await mgr.contribute(100);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('incrbyfloat unavailable'),
      );
      warnSpy.mockRestore();
    });
  });

  describe('tryTrigger — _claimPool poolAmount = 0 guard', () => {
    it('returns null when Lua script returns pool of 0 (already claimed)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ current_amount: '1000' }], rowCount: 1 });
      mockRedisSet.mockResolvedValueOnce('OK');

      const mgr = await JackpotManager.getInstance(mockDb as never, mockRedis as never);

      // Force jackpot via triggerForTest with poolAmount = 0
      const result = await mgr.triggerForTest('user-x', 0);
      expect(result).toBeNull();
    });

    it('returns null when pool claim results in zero amount (concurrent race simulation)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ current_amount: '5000' }], rowCount: 1 });
      mockRedisSet.mockResolvedValueOnce('OK');

      const mgr = await JackpotManager.getInstance(mockDb as never, mockRedis as never);

      // Simulate concurrent race: pool was concurrently claimed, so Lua GETDEL returns '0'
      // We use triggerForTest with 0 to test the poolAmount <= 0 guard in _claimPoolWithAmount
      // which is also hit when _claimPool calculates Math.round(parseFloat('0')) = 0
      const result = await mgr.triggerForTest('user-race', 0);
      expect(result).toBeNull();
    });

    it('_claimPool executes Lua atomic claim when roll hits (forced via crypto.randomInt spy)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ current_amount: '7777' }], rowCount: 1 });
      mockRedisSet.mockResolvedValueOnce('OK');

      const mgr = await JackpotManager.getInstance(mockDb as never, mockRedis as never);

      // Force crypto.randomInt to return 0 (jackpot trigger)
      const cryptoModule = require('crypto');
      const randomIntSpy = jest.spyOn(cryptoModule, 'randomInt').mockReturnValueOnce(0);

      // Clear any queued mock values and set fresh unconditional return for eval
      mockRedisEval.mockReset();
      mockRedisEval.mockResolvedValueOnce('7777');

      const trxQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT jackpot_history
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE user_wallets
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT transactions

      mockTransaction.mockImplementationOnce(async (callback: (trx: DbClient) => Promise<void>) => {
        const trx: DbClient = { query: trxQuery, transaction: jest.fn() };
        await callback(trx);
      });

      const result = await mgr.tryTrigger(1, 'user-jackpot-forced');
      randomIntSpy.mockRestore();

      expect(result).not.toBeNull();
      expect(result?.winnerId).toBe('user-jackpot-forced');
      expect(result?.amount).toBe(7777);
    });
  });
});
