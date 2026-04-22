import { randomUUID } from 'crypto';
import { DbClient } from '../utils/db';
import { encrypt, hmac } from '../utils/crypto';

// ---------------------------------------------------------------------------
// PrivacyService
// ---------------------------------------------------------------------------

/**
 * PDPA-compliant account deletion and consent management.
 *
 * Implements:
 * - US-PRIV-002: 30-day soft-delete → scheduled anonymisation
 * - Account deletion cancellation (window: before executed_at is set)
 *
 * Dependency-injected `DbClient` and `hmacSecret` for testability.
 */
export class PrivacyService {
  private _db: DbClient;
  private _hmacSecret: string;

  constructor(db: DbClient, hmacSecret: string) {
    this._db = db;
    this._hmacSecret = hmacSecret;
  }

  // ---------------------------------------------------------------------------
  // Account deletion lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Submits an account deletion request.
   *
   * - Creates a deletion_requests row scheduled 30 days from now (ON CONFLICT DO NOTHING
   *   prevents duplicate requests from the same user).
   * - Sets users.deletion_status = 'pending' immediately.
   *
   * US-PRIV-002/AC-1: User can withdraw request within 30 days via cancelDeletion.
   */
  async requestDeletion(userId: string): Promise<void> {
    await this._db.query(
      `INSERT INTO deletion_requests(user_id, requested_at, scheduled_for)
       VALUES($1, NOW(), NOW() + INTERVAL '30 days')
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
    await this._db.query(
      "UPDATE users SET deletion_status='pending', deletion_requested_at=NOW() WHERE id=$1",
      [userId],
    );
  }

  /**
   * Cancels a pending deletion request.
   *
   * Sets deletion_requests.cancelled_at = NOW() only if the request has NOT yet been executed.
   * Throws HTTP 409 if:
   *  - No pending (un-cancelled, un-executed) request exists, OR
   *  - Request was already executed (30 days elapsed; anonymisation already ran).
   *
   * US-PRIV-002/AC-1.
   */
  async cancelDeletion(userId: string): Promise<void> {
    const result = await this._db.query<{ user_id: string }>(
      `UPDATE deletion_requests
       SET cancelled_at = NOW()
       WHERE user_id = $1 AND executed_at IS NULL AND cancelled_at IS NULL
       RETURNING user_id`,
      [userId],
    );
    if (result.rowCount === 0) {
      // Either no pending request or already executed/cancelled
      throw Object.assign(
        new Error('deletion_not_cancellable'),
        { statusCode: 409 },
      );
    }
    await this._db.query(
      "UPDATE users SET deletion_status='active', deletion_requested_at=NULL WHERE id=$1",
      [userId],
    );
  }

  /**
   * Processes all deletion requests where scheduled_for <= NOW() and not yet executed.
   * Intended to be called by a daily cron job (EDD §2.7).
   *
   * For each eligible user:
   * 1. Anonymises users.email (AES-256-GCM encrypted anon address).
   * 2. Anonymises users.email_hash (HMAC of the anon address).
   *    CRITICAL: both must be updated together — leaving email_hash as HMAC of the real
   *    email retains a reversible PII fingerprint (PDPA compliance failure).
   * 3. Anonymises users.nickname.
   * 4. Sets deletion_status = 'deleted'.
   * 5. Marks deletion_requests.executed_at = NOW().
   *
   * Transactions / audit:
   * - Each user is processed in its own transaction for isolation.
   * - Financial transactions rows are RETAINED (7-year tax law retention); only the
   *   users table PII is anonymised.
   */
  async executeScheduledDeletions(): Promise<void> {
    const rows = await this._db.query<{ user_id: string }>(
      "SELECT user_id FROM deletion_requests WHERE scheduled_for <= NOW() AND executed_at IS NULL AND cancelled_at IS NULL",
    );

    for (const row of rows.rows) {
      await this._db.transaction(async (trx) => {
        const anonSuffix = randomUUID().slice(0, 8);
        const anonNickname = `deleted_${anonSuffix}`;
        const anonEmail = `${anonNickname}@deleted.invalid`;

        // PDPA hard delete: anonymise BOTH email (encrypted) AND email_hash (HMAC)
        const encryptedAnonEmail = encrypt(anonEmail);
        const anonEmailHash = hmac(anonEmail, this._hmacSecret);

        await trx.query(
          `UPDATE users
           SET email = $1, email_hash = $2, nickname = $3, deletion_status = 'deleted'
           WHERE id = $4`,
          [encryptedAnonEmail, anonEmailHash, anonNickname, row.user_id],
        );

        // Mark executed — prevents re-processing in subsequent cron runs
        await trx.query(
          "UPDATE deletion_requests SET executed_at=NOW() WHERE user_id=$1",
          [row.user_id],
        );
      });
    }
  }
}
