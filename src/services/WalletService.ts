import { DbClient } from '../utils/db';

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

/**
 * Thrown when a debit is attempted but the user's balance is insufficient.
 * WalletService.debitGold rolls back the transaction and raises this error.
 */
export class InsufficientFundsError extends Error {
  public readonly statusCode = 422;

  constructor(message = 'Insufficient gold balance') {
    super(message);
    this.name = 'InsufficientFundsError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// WalletService
// ---------------------------------------------------------------------------

/**
 * Atomic dual-currency wallet operations backed by PostgreSQL.
 *
 * All mutations are wrapped in transactions to prevent double-spend.
 * Gold debit uses SELECT … FOR UPDATE to lock the row before checking balance.
 *
 * Dependency-injected `DbClient` allows test mocking without patching globals.
 */
export class WalletService {
  private _db: DbClient;

  constructor(db: DbClient) {
    this._db = db;
  }

  // ---------------------------------------------------------------------------
  // Gold operations
  // ---------------------------------------------------------------------------

  /**
   * Returns current gold balance for a user.
   * Used in GameRoom.onJoin to populate PlayerState.gold.
   */
  async getGold(userId: string): Promise<number> {
    const row = await this._db.query<{ gold: string | number }>(
      'SELECT gold FROM user_wallets WHERE user_id=$1',
      [userId],
    );
    return Number(row.rows[0]?.gold ?? 0);
  }

  /**
   * Deducts `amount` gold from the user's wallet.
   *
   * Uses SELECT … FOR UPDATE to prevent concurrent double-spend.
   * Throws InsufficientFundsError if balance < amount (transaction rolls back).
   * Records a 'spend' transaction row for audit trail.
   */
  async debitGold(userId: string, amount: number): Promise<void> {
    await this._db.transaction(async (trx) => {
      const row = await trx.query<{ gold: number }>(
        'SELECT gold FROM user_wallets WHERE user_id=$1 FOR UPDATE',
        [userId],
      );
      const currentGold = row.rows[0]?.gold ?? 0;
      if (currentGold < amount) {
        throw new InsufficientFundsError();
      }
      await trx.query(
        'UPDATE user_wallets SET gold = gold - $1 WHERE user_id = $2',
        [amount, userId],
      );
      await trx.query(
        "INSERT INTO transactions(user_id,type,amount,currency,created_at) VALUES($1,'spend',$2,'gold',NOW())",
        [userId, -amount],
      );
    });
  }

  /**
   * Credits `amount` gold to the user's wallet.
   *
   * @param type Transaction type — constrained to a known union to prevent
   *             arbitrary strings from being inserted into the transactions table.
   *             Defaults to 'earn'.
   */
  async creditGold(
    userId: string,
    amount: number,
    type: 'earn' | 'jackpot' | 'daily_restore' | 'refund' = 'earn',
  ): Promise<void> {
    await this._db.transaction(async (trx) => {
      await trx.query(
        'UPDATE user_wallets SET gold = gold + $1 WHERE user_id = $2',
        [amount, userId],
      );
      await trx.query(
        "INSERT INTO transactions(user_id,type,amount,currency,created_at) VALUES($1,$2,$3,'gold',NOW())",
        [userId, type, amount],
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Diamond operations
  // ---------------------------------------------------------------------------

  /**
   * Credits diamond from a verified IAP receipt.
   *
   * Idempotent: duplicate receipt_hash is silently ignored (returns without error).
   * Records both the receipt and the wallet credit in the same transaction.
   */
  async creditDiamond(
    userId: string,
    amount: number,
    receiptHash: string,
    platform: 'apple' | 'google',
    productId: string,
  ): Promise<void> {
    await this._db.transaction(async (trx) => {
      const existing = await trx.query<{ id: string }>(
        'SELECT id FROM iap_receipts WHERE receipt_hash=$1',
        [receiptHash],
      );
      if (existing.rows.length > 0) return; // idempotent: already processed

      await trx.query(
        'INSERT INTO iap_receipts(user_id, receipt_hash, platform, product_id, diamond_amt, created_at) VALUES($1,$2,$3,$4,$5,NOW())',
        [userId, receiptHash, platform, productId, amount],
      );
      await trx.query(
        'UPDATE user_wallets SET diamond = diamond + $1 WHERE user_id=$2',
        [amount, userId],
      );
      await trx.query(
        "INSERT INTO transactions(user_id,type,amount,currency,created_at) VALUES($1,'iap',$2,'diamond',NOW())",
        [userId, amount],
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Daily restore
  // ---------------------------------------------------------------------------

  /**
   * Restores daily free gold for active users whose balance is below the threshold.
   * Guarded by OQ5 feature flag (DAILY_GOLD_THRESHOLD env var, defaults to 0 = disabled).
   */
  async restoreDailyGold(): Promise<void> {
    const threshold = parseInt(process.env.DAILY_GOLD_THRESHOLD ?? '0', 10);
    const amount = parseInt(process.env.DAILY_GOLD_AMOUNT ?? '0', 10);
    if (!threshold || !amount) return; // OQ5: values TBD — disabled until configured

    await this._db.transaction(async (trx) => {
      const eligible = await trx.query<{ user_id: string }>(
        `SELECT uw.user_id FROM user_wallets uw
         JOIN users u ON u.id = uw.user_id
         WHERE uw.gold < $1 AND u.deletion_status = 'active'`,
        [threshold],
      );
      if (eligible.rowCount === 0) return;

      const ids = eligible.rows.map(r => r.user_id);
      await trx.query(
        `UPDATE user_wallets SET gold = gold + $1 WHERE user_id = ANY($2::uuid[])`,
        [amount, ids],
      );
      await trx.query(
        `INSERT INTO transactions(user_id, type, amount, currency, created_at)
         SELECT unnest($1::uuid[]), 'daily_restore', $2, 'gold', NOW()`,
        [ids, amount],
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Batch flush (write-behind cache placeholder)
  // ---------------------------------------------------------------------------

  /**
   * Flushes any pending async wallet writes.
   * No-op in MVP — all mutations are synchronous transactions.
   * Add write-behind cache logic here if needed for high-throughput optimisation.
   */
  async flushBatch(): Promise<void> {
    // No-op in MVP
  }
}
