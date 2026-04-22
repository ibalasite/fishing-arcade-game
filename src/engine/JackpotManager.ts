import crypto from 'crypto';
import { DbClient } from '../utils/db';
import { JackpotResult } from './RTPEngine';

// ---------------------------------------------------------------------------
// Constants (exported so tests can assert table values)
// ---------------------------------------------------------------------------

/**
 * Jackpot trigger probability table.
 * Key = cannon multiplier; value = denominator (1-in-N odds via CSPRNG roll === 0).
 * From PDD §3.5 / PRD US-JACK-002.
 */
export const JACKPOT_ODDS: Record<number, number> = {
  1: 500_000,
  10: 50_000,
  50: 10_000,
  100: 5_000,
};

/**
 * Pool seed amount set after a jackpot is claimed.
 * Prevents the pool from dropping to zero after a win.
 */
export const JACKPOT_SEED_AMOUNT = 1_000;

/** Redis key for the jackpot pool (plain string; INCRBYFLOAT compatible) */
const POOL_KEY = 'game:jackpot:pool';

/** Jackpot contribution rate: each bet contributes this fraction to the pool */
const CONTRIBUTION_RATE = parseFloat(process.env.JACKPOT_CONTRIB_RATE ?? '0.01');

// ---------------------------------------------------------------------------
// Minimal Redis interface (subset of ioredis used here)
// ---------------------------------------------------------------------------
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  incrbyfloat?(key: string, increment: number): Promise<string>;
  eval(script: string, numkeys: number, ...args: string[]): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// JackpotManager
// ---------------------------------------------------------------------------

/**
 * Jackpot pool accumulation, trigger, and persistence.
 *
 * Singleton pattern with race-condition guard:
 * Concurrent callers await the same promise, preventing double-initialization
 * under HPA multi-pod startup (EDD §2.2).
 *
 * Pool persistence strategy:
 * - Hot path: Redis `game:jackpot:pool` (INCRBYFLOAT per bet, sub-millisecond)
 * - Source of truth: PostgreSQL `jackpot_pool` table
 * - Written on jackpot trigger + room onDispose
 * - Restored from PostgreSQL on server restart
 */
export class JackpotManager {
  private static _instance: JackpotManager | null = null;
  private static _initPromise: Promise<JackpotManager> | null = null;

  private _redis: RedisClient;
  private _db: DbClient;

  private constructor(db: DbClient, redis: RedisClient) {
    this._db = db;
    this._redis = redis;
  }

  // ---------------------------------------------------------------------------
  // Singleton factory
  // ---------------------------------------------------------------------------

  /**
   * Returns the singleton instance. Concurrent callers share one init promise
   * to avoid double-initialization.
   *
   * @param db    Optional: inject a specific DbClient (for testing or first init).
   * @param redis Optional: inject a specific RedisClient (for testing or first init).
   */
  public static getInstance(db?: DbClient, redis?: RedisClient): Promise<JackpotManager> {
    if (!JackpotManager._initPromise) {
      JackpotManager._initPromise = (async () => {
        if (!JackpotManager._instance) {
          if (!db || !redis) {
            throw new Error('JackpotManager.getInstance() requires db and redis on first call.');
          }
          const mgr = new JackpotManager(db, redis);
          await mgr.restorePool();
          JackpotManager._instance = mgr;
        }
        return JackpotManager._instance;
      })();
    }
    return JackpotManager._initPromise;
  }

  /**
   * Resets the singleton — for testing only.
   * Call in beforeEach to ensure test isolation.
   */
  public static resetInstance(): void {
    JackpotManager._instance = null;
    JackpotManager._initPromise = null;
  }

  // ---------------------------------------------------------------------------
  // Core API
  // ---------------------------------------------------------------------------

  /**
   * Attempts to trigger a jackpot.
   *
   * Uses CSPRNG (crypto.randomInt) for financial-grade randomness.
   * Jackpot trigger: roll === 0.
   *
   * On win:
   * 1. Atomically claims pool via Redis Lua script (GETDEL + SET seed).
   * 2. Credits winner's wallet and records history in a single DB transaction.
   *
   * @param multiplier Cannon multiplier — determines trigger odds.
   * @param userId     Verified user UUID (from client.auth, set by onAuth).
   */
  async tryTrigger(multiplier: number, userId: string): Promise<JackpotResult | null> {
    const odds = JACKPOT_ODDS[multiplier] ?? JACKPOT_ODDS[1];
    const roll = crypto.randomInt(odds);
    if (roll !== 0) return null;

    return this._claimPool(userId);
  }

  /**
   * Forces a jackpot claim for a given user and pool amount.
   * Exposed ONLY for testing — not accessible via normal game flow.
   */
  async triggerForTest(userId: string, poolAmount: number): Promise<JackpotResult | null> {
    return this._claimPoolWithAmount(userId, poolAmount);
  }

  /**
   * Contribute to jackpot pool from a bet.
   * Called by GameRoom._handleShoot after debit.
   */
  async contribute(betAmount: number): Promise<void> {
    const contribution = betAmount * CONTRIBUTION_RATE;
    if (this._redis.incrbyfloat) {
      await this._redis.incrbyfloat(POOL_KEY, contribution);
    }
  }

  /**
   * Persist Redis pool to PostgreSQL.
   * Called in GameRoom.onDispose and on jackpot trigger.
   */
  async persistPool(): Promise<void> {
    const pool = await this._redis.get(POOL_KEY);
    await this._db.query(
      'UPDATE jackpot_pool SET current_amount=$1, updated_at=NOW() WHERE id=1',
      [pool],
    );
  }

  /**
   * Restore pool from PostgreSQL to Redis on server startup.
   */
  async restorePool(): Promise<void> {
    const row = await this._db.query<{ current_amount: string }>(
      'SELECT current_amount FROM jackpot_pool WHERE id=1',
    );
    const amount = row.rows[0]?.current_amount ?? '0';
    await this._redis.set(POOL_KEY, amount);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Atomically claims the pool via Lua script and credits the winner.
   * The Lua script runs atomically on the Redis server — prevents multiple concurrent winners.
   */
  private async _claimPool(userId: string): Promise<JackpotResult | null> {
    const LUA_ATOMIC_CLAIM = `
      local v = redis.call('GETDEL', KEYS[1])
      if not v then return nil end
      redis.call('SET', KEYS[1], ARGV[1])
      return v
    `;
    const poolStr = await this._redis.eval(
      LUA_ATOMIC_CLAIM,
      1,
      POOL_KEY,
      String(JACKPOT_SEED_AMOUNT),
    ) as string | null;

    // INCRBYFLOAT stores a float string; Math.round avoids truncation of fractional contributions
    const poolAmount = Math.round(parseFloat(poolStr ?? '0'));
    if (poolAmount <= 0) return null; // another instance claimed it concurrently

    return this._claimPoolWithAmount(userId, poolAmount);
  }

  private async _claimPoolWithAmount(userId: string, poolAmount: number): Promise<JackpotResult | null> {
    if (poolAmount <= 0) return null;

    // Credit winner and record history in a single DB transaction
    await this._db.transaction(async (trx) => {
      await trx.query(
        'INSERT INTO jackpot_history (winner_id, amount, triggered_at) VALUES ($1,$2,NOW())',
        [userId, poolAmount],
      );
      await trx.query(
        'UPDATE user_wallets SET gold = gold + $1 WHERE user_id = $2',
        [poolAmount, userId],
      );
      await trx.query(
        "INSERT INTO transactions(user_id,type,amount,currency,created_at) VALUES($1,'jackpot',$2,'gold',NOW())",
        [userId, poolAmount],
      );
    });

    return { winnerId: userId, amount: poolAmount };
  }
}
