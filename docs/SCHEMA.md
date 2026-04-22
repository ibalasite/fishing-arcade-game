# Database Schema Reference — Fishing Arcade Game

<!-- DOC-ID: SCHEMA-FISHING-ARCADE-GAME-20260422 -->
<!-- Parent: EDD-FISHING-ARCADE-GAME-20260422 (docs/EDD.md) -->
<!-- Database: PostgreSQL 15 + Redis 7 -->

---

## Document Control

| Field | Content |
|-------|---------|
| **DOC-ID** | SCHEMA-FISHING-ARCADE-GAME-20260422 |
| **Project** | fishing-arcade-game |
| **Version** | v1.0 |
| **Status** | DRAFT |
| **Source** | EDD v1.5 §2.6, §2.3, §2.4 (IN_REVIEW) |
| **Date** | 2026-04-22 |

---

## §1 Full DDL

### `users`

```sql
-- email: AES-256-GCM encrypted (non-deterministic nonce); stored as BYTEA
-- email_hash: HMAC-SHA256(plaintext_email, HMAC_SECRET_KEY); enables uniqueness lookup
-- because AES-GCM random nonce means the same email → different ciphertext each encrypt
CREATE TABLE users (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email                 BYTEA        NOT NULL,
    email_hash            BYTEA        NOT NULL UNIQUE,
    nickname              VARCHAR(50)  NOT NULL,
    password_hash         TEXT         NOT NULL,           -- bcrypt
    device_id             VARCHAR(64),                     -- SHA-256 hash of device ID; original never stored
    deletion_status       VARCHAR(20)  NOT NULL DEFAULT 'active'
                              CHECK (deletion_status IN ('active', 'pending', 'deleted')),
    deletion_requested_at TIMESTAMPTZ,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

### `user_wallets`

```sql
-- 1:1 with users; CASCADE delete allowed (wallet has no independent regulatory value)
CREATE TABLE user_wallets (
    user_id    UUID    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    gold       BIGINT  NOT NULL DEFAULT 0 CHECK (gold >= 0),
    diamond    INTEGER NOT NULL DEFAULT 0 CHECK (diamond >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `transactions`

```sql
-- Immutable ledger; rows are never deleted; retained 7 years (tax law)
-- After user deletion, user_id UUID reference is retained; PII anonymised in users row only
CREATE TABLE transactions (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL REFERENCES users(id),
    type       VARCHAR(20)  NOT NULL
                   CHECK (type IN ('earn', 'spend', 'iap', 'jackpot', 'refund', 'daily_restore')),
    amount     BIGINT       NOT NULL,          -- positive = credit; negative = debit
    currency   VARCHAR(10)  NOT NULL DEFAULT 'gold'
                   CHECK (currency IN ('gold', 'diamond')),
    ref_id     UUID,                           -- optional FK: game_session_id or iap_receipt_id
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_user_created ON transactions(user_id, created_at DESC);
```

### `iap_receipts`

```sql
-- Idempotency table: receipt_hash uniqueness prevents double diamond grant
CREATE TABLE iap_receipts (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID         NOT NULL REFERENCES users(id),
    receipt_hash VARCHAR(64)  NOT NULL UNIQUE,  -- SHA-256(receipt) hex string
    platform     VARCHAR(10)  NOT NULL CHECK (platform IN ('apple', 'google')),
    product_id   VARCHAR(100) NOT NULL,
    diamond_amt  INTEGER      NOT NULL CHECK (diamond_amt > 0),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

### `jackpot_pool`

```sql
-- Singleton state table; enforced by CHECK (id = 1)
-- Source of truth for Redis restore on server restart
CREATE TABLE jackpot_pool (
    id             INTEGER  PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    current_amount BIGINT   NOT NULL DEFAULT 10000,  -- seed amount in gold coins
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert the singleton row on first deploy:
INSERT INTO jackpot_pool (id, current_amount) VALUES (1, 10000) ON CONFLICT DO NOTHING;
```

### `jackpot_history`

```sql
-- Audit trail of all jackpot payouts
CREATE TABLE jackpot_history (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    winner_id    UUID         NOT NULL REFERENCES users(id),
    amount       BIGINT       NOT NULL CHECK (amount > 0),
    triggered_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    room_id      VARCHAR(100)
);

CREATE INDEX idx_jackpot_history_winner ON jackpot_history(winner_id, triggered_at DESC);
```

### `game_sessions`

```sql
-- Analytics + admin dashboard; ip_address auto-NULLed after 90 days by ip-cleanup cron
CREATE TABLE game_sessions (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id      VARCHAR(100) NOT NULL,
    started_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    ended_at     TIMESTAMPTZ,
    ip_address   INET,                           -- logged for anti-cheat; masked in logs; deleted after 90 days
    player_ids   UUID[]       NOT NULL DEFAULT '{}',
    player_count INTEGER      NOT NULL DEFAULT 0,
    room_state   VARCHAR(20)  NOT NULL DEFAULT 'WAITING'
                     CHECK (room_state IN ('WAITING', 'PLAYING', 'ENDED'))
);

CREATE INDEX idx_game_sessions_started_at ON game_sessions(started_at);
CREATE INDEX idx_game_sessions_room_id   ON game_sessions(room_id);
```

### `user_consents`

```sql
-- PDPA consent records; ON DELETE RESTRICT: consent records must be retained as evidence
-- even after account deletion/anonymisation (PDPA compliance).
-- executeScheduledDeletions soft-anonymises users row; does NOT hard-delete it.
CREATE TABLE user_consents (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    consent_type   VARCHAR(100) NOT NULL
                       CHECK (consent_type IN ('privacy_policy', 'marketing')),
    granted        BOOLEAN      NOT NULL,
    granted_at     TIMESTAMPTZ,
    revoked_at     TIMESTAMPTZ,                  -- NULL = not revoked
    policy_version VARCHAR(20)  NOT NULL,        -- references privacy_policies.version
    ip_address     INET,
    user_agent     TEXT,                         -- stored for PDPA evidence; OS version beyond masked in logs
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_consents_user_type ON user_consents(user_id, consent_type);
```

### `deletion_requests`

```sql
-- Tracks 30-day soft-delete schedule; PK = user_id (one pending request per user)
CREATE TABLE deletion_requests (
    user_id       UUID        PRIMARY KEY REFERENCES users(id),
    requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scheduled_for TIMESTAMPTZ NOT NULL,           -- = requested_at + 30 days
    executed_at   TIMESTAMPTZ,                    -- set by executeScheduledDeletions cron
    cancelled_at  TIMESTAMPTZ                     -- set by cancelDeletion API
);
```

### `privacy_policies`

```sql
-- Version registry for consent tracking; consent records reference version string
CREATE TABLE privacy_policies (
    version      VARCHAR(20)  PRIMARY KEY,       -- semver e.g. '1.0.0'
    content_url  TEXT         NOT NULL,           -- URL to hosted policy text
    effective_at TIMESTAMPTZ  NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

### `rtp_logs`

```sql
-- Regulatory audit trail; PERMANENT retention (never deleted)
-- Used by: wallet-reconcile cron; regulatory 'all bets by user' queries
CREATE TABLE rtp_logs (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id      VARCHAR(100) NOT NULL,
    user_id      UUID         NOT NULL,           -- no FK: user row may be anonymised; UUID retained
    fish_type    VARCHAR(20)  NOT NULL CHECK (fish_type IN ('normal', 'elite', 'boss')),
    bet_amount   BIGINT       NOT NULL CHECK (bet_amount > 0),
    multiplier   INTEGER      NOT NULL CHECK (multiplier > 0),
    hit          BOOLEAN      NOT NULL,
    payout       BIGINT       NOT NULL DEFAULT 0,
    rtp_at_time  NUMERIC(5,4) NOT NULL,           -- running RTP at adjudication time (e.g. 0.9250)
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rtp_logs_room ON rtp_logs(room_id, created_at DESC);
CREATE INDEX idx_rtp_logs_user ON rtp_logs(user_id, created_at DESC);  -- regulatory 'all bets by user'
```

---

## §2 All Indexes

| Index Name | Table | Columns | Type | Purpose |
|-----------|-------|---------|------|---------|
| `users_pkey` | users | `id` | PK / B-tree | Primary key |
| `users_email_hash_key` | users | `email_hash` | Unique B-tree | Uniqueness lookup (AES-GCM is non-deterministic) |
| `user_wallets_pkey` | user_wallets | `user_id` | PK / B-tree | Primary key; 1:1 join with users |
| `idx_transactions_user_created` | transactions | `(user_id, created_at DESC)` | Composite B-tree | Wallet reconciliation; audit queries |
| `iap_receipts_receipt_hash_key` | iap_receipts | `receipt_hash` | Unique B-tree | Idempotency check before diamond credit |
| `jackpot_pool_pkey` | jackpot_pool | `id` | PK + CHECK | Singleton enforcement |
| `idx_jackpot_history_winner` | jackpot_history | `(winner_id, triggered_at DESC)` | Composite B-tree | Player jackpot history lookup |
| `idx_game_sessions_started_at` | game_sessions | `started_at` | B-tree | Analytics range queries |
| `idx_game_sessions_room_id` | game_sessions | `room_id` | B-tree | Room-level session lookup |
| `idx_user_consents_user_type` | user_consents | `(user_id, consent_type)` | Composite B-tree | Login policy-version check; latest consent per type |
| `deletion_requests_pkey` | deletion_requests | `user_id` | PK / B-tree | One pending request per user; cron scheduled_for query |
| `privacy_policies_pkey` | privacy_policies | `version` | PK / B-tree | Version lookup at consent grant/revoke |
| `idx_rtp_logs_room` | rtp_logs | `(room_id, created_at DESC)` | Composite B-tree | Room-level RTP audit |
| `idx_rtp_logs_user` | rtp_logs | `(user_id, created_at DESC)` | Composite B-tree | Regulatory 'all bets by user' query |

---

## §3 Entity-Relationship Diagram

```mermaid
erDiagram
    users {
        UUID id PK
        BYTEA email "AES-256-GCM encrypted"
        BYTEA email_hash UK "HMAC-SHA256 for uniqueness"
        VARCHAR50 nickname
        TEXT password_hash "bcrypt"
        VARCHAR64 device_id "SHA-256 hash"
        VARCHAR20 deletion_status "active|pending|deleted"
        TIMESTAMPTZ deletion_requested_at
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    user_wallets {
        UUID user_id PK_FK
        BIGINT gold "CHECK >= 0"
        INTEGER diamond "CHECK >= 0"
        TIMESTAMPTZ updated_at
    }

    transactions {
        UUID id PK
        UUID user_id FK
        VARCHAR20 type "earn|spend|iap|jackpot|refund|daily_restore"
        BIGINT amount "+credit|-debit"
        VARCHAR10 currency "gold|diamond"
        UUID ref_id "optional: session or receipt"
        TIMESTAMPTZ created_at
    }

    iap_receipts {
        UUID id PK
        UUID user_id FK
        VARCHAR64 receipt_hash UK "SHA-256"
        VARCHAR10 platform "apple|google"
        VARCHAR100 product_id
        INTEGER diamond_amt
        TIMESTAMPTZ created_at
    }

    jackpot_pool {
        INTEGER id PK "singleton, CHECK = 1"
        BIGINT current_amount "seed = 10000"
        TIMESTAMPTZ updated_at
    }

    jackpot_history {
        UUID id PK
        UUID winner_id FK
        BIGINT amount
        TIMESTAMPTZ triggered_at
        VARCHAR100 room_id
    }

    game_sessions {
        UUID id PK
        VARCHAR100 room_id
        TIMESTAMPTZ started_at
        TIMESTAMPTZ ended_at
        INET ip_address "NULLed after 90 days"
        UUID_ARRAY player_ids
        INTEGER player_count
        VARCHAR20 room_state "WAITING|PLAYING|ENDED"
    }

    user_consents {
        UUID id PK
        UUID user_id FK "ON DELETE RESTRICT"
        VARCHAR100 consent_type "privacy_policy|marketing"
        BOOLEAN granted
        TIMESTAMPTZ granted_at
        TIMESTAMPTZ revoked_at
        VARCHAR20 policy_version FK
        INET ip_address
        TEXT user_agent
        TIMESTAMPTZ created_at
    }

    deletion_requests {
        UUID user_id PK_FK
        TIMESTAMPTZ requested_at
        TIMESTAMPTZ scheduled_for
        TIMESTAMPTZ executed_at
        TIMESTAMPTZ cancelled_at
    }

    privacy_policies {
        VARCHAR20 version PK "semver"
        TEXT content_url
        TIMESTAMPTZ effective_at
        TIMESTAMPTZ created_at
    }

    rtp_logs {
        UUID id PK
        VARCHAR100 room_id
        UUID user_id "no FK — survives anonymisation"
        VARCHAR20 fish_type "normal|elite|boss"
        BIGINT bet_amount
        INTEGER multiplier
        BOOLEAN hit
        BIGINT payout
        NUMERIC rtp_at_time "5,4 precision"
        TIMESTAMPTZ created_at
    }

    users ||--|| user_wallets : "1:1 wallet"
    users ||--o{ transactions : "ledger entries"
    users ||--o{ iap_receipts : "purchase receipts"
    users ||--o{ jackpot_history : "jackpot wins"
    users ||--o{ user_consents : "consent records (RESTRICT)"
    users ||--o| deletion_requests : "deletion schedule"
    privacy_policies ||--o{ user_consents : "policy version"
```

---

## §4 Data Dictionary — Key Columns

| Table | Column | Type | Description |
|-------|--------|------|-------------|
| users | `email` | BYTEA | AES-256-GCM encrypted email. Retrieved and decrypted only in application layer. Never logged in plaintext. KEK stored in k8s Secret or Vault. |
| users | `email_hash` | BYTEA | `HMAC-SHA256(plaintext_email, HMAC_SECRET_KEY)`. Used for uniqueness lookup and login. Updated atomically with `email` on any email change. |
| users | `password_hash` | TEXT | bcrypt hash of plaintext password. Plaintext password never persisted or logged. |
| users | `device_id` | VARCHAR(64) | SHA-256 hash of device identifier. Original device ID never stored. Used for anti-cheat pattern analysis. |
| users | `deletion_status` | VARCHAR(20) | `active`: normal account. `pending`: deletion requested, within 30-day window. `deleted`: PII anonymised by `executeScheduledDeletions` cron. |
| user_wallets | `gold` | BIGINT | Free virtual currency. `CHECK (gold >= 0)` prevents negative balance at DB level. All mutations via `WalletService` with `FOR UPDATE` row-lock. |
| user_wallets | `diamond` | INTEGER | Paid virtual currency (IAP only). Cannot be withdrawn or exchanged for cash (US-CURR-001/AC-3). |
| transactions | `amount` | BIGINT | Positive = credit to wallet. Negative = debit from wallet. Immutable after insert. |
| transactions | `type` | VARCHAR(20) | `earn`: fish kill reward. `spend`: bullet bet. `iap`: diamond purchase. `jackpot`: jackpot payout. `refund`: admin refund. `daily_restore`: free gold top-up. |
| iap_receipts | `receipt_hash` | VARCHAR(64) | `SHA-256(raw_receipt)` hex string. Unique index prevents double diamond grant on retry. Idempotency key. |
| jackpot_pool | `id` | INTEGER | Always 1. `CHECK (id = 1)` enforces singleton. Redis key `game:jackpot:pool` is the hot-path store; this table is the source of truth for restores. |
| jackpot_history | `winner_id` | UUID | Verified user UUID from `client.auth.userId` (set by `onAuth`). Never the Colyseus `sessionId`. |
| game_sessions | `ip_address` | INET | Anti-cheat source IP. Last 2 octets masked in logs. Auto-NULLed by `ip-cleanup` CronJob after 90 days. |
| game_sessions | `player_ids` | UUID[] | Array appended in `onJoin`. Default `'{}'` allows INSERT before any player joins. |
| game_sessions | `room_state` | VARCHAR(20) | Mirrors `GameState.roomState` for analytics queries without joining real-time state. |
| user_consents | `policy_version` | VARCHAR(20) | NOT NULL — always records the active policy version at consent time. References `privacy_policies.version`. |
| user_consents | `revoked_at` | TIMESTAMPTZ | NULL = active consent. Non-NULL = revoked. A new row is inserted for each consent event (immutable audit trail). |
| rtp_logs | `user_id` | UUID | No FK constraint (intentional). `rtp_logs` is permanent; after account deletion, the UUID is retained as an opaque reference for RTP audit. |
| rtp_logs | `rtp_at_time` | NUMERIC(5,4) | Running RTP percentage at the moment of adjudication, e.g. `0.9250` = 92.50%. `NUMERIC` avoids floating-point representation errors for financial records. |

---

## §5 Data Retention Policies

| Table / Column | Retention Policy | Mechanism |
|----------------|-----------------|-----------|
| `rtp_logs` (entire table) | **Permanent** — never deleted | No delete policy; no cron touches this table; regulatory audit requirement |
| `game_sessions.ip_address` | **90 days** — then NULL | `ip-cleanup` CronJob: daily 04:00 UTC — `UPDATE game_sessions SET ip_address=NULL WHERE started_at < NOW() - INTERVAL '90 days' AND ip_address IS NOT NULL` |
| `transactions` (entire table) | **7 years** — never deleted | Tax law; user deletion anonymises `users` row but leaves transaction `user_id` UUID reference intact |
| `iap_receipts` (entire table) | **7 years** — financial record | No delete; `user_id` UUID reference retained after user deletion |
| `jackpot_history` (entire table) | **7 years** — financial record | No delete; `winner_id` UUID reference retained after user deletion |
| `user_consents` (entire table) | **Retained after account deletion** | `ON DELETE RESTRICT` on `users.id` FK; consent rows provide PDPA evidence; never deleted |
| `users.email`, `users.email_hash`, `users.nickname` | **Anonymised 30 days after deletion request** | `executeScheduledDeletions` cron replaces PII with `deleted_<random8>@deleted.invalid` placeholder |
| `deletion_requests` | Retained indefinitely | Audit record of when deletion was requested and executed |
| Active sessions (`game_sessions`) | Retained indefinitely (post-game analytics) | `ended_at` set on room dispose; IP column NULLed after 90 days |

---

## §6 PII Columns

| Table | Column | PII Type | Protection Method |
|-------|--------|----------|-------------------|
| users | `email` | Direct identifier | AES-256-GCM encryption; KEK in k8s Secret / Vault; never logged; never returned to client in plaintext |
| users | `email_hash` | Pseudonymous | HMAC-SHA256; one-way with server secret; used only for uniqueness lookup |
| users | `nickname` | Quasi-identifier | Plaintext; partial mask in logs (`阿凱***`); max 50 chars |
| users | `password_hash` | Credential | bcrypt; plaintext never stored or logged |
| users | `device_id` | Device fingerprint | SHA-256 hash; original never persisted; anti-cheat use only |
| game_sessions | `ip_address` | Network identifier | Stored; last 2 octets masked in logs; hard-deleted (NULLed) after 90 days by cron |
| user_consents | `ip_address` | Network identifier | Stored for PDPA evidence; last 2 octets masked in logs |
| user_consents | `user_agent` | Device/browser info | Stored for PDPA evidence; OS version and beyond masked in logs |
| JWT claims | `sub` (userId) | Pseudonymous identifier | UUID only; no PII beyond `userId` and `role` in token claims |

**Pino log redaction** (configured at startup):
```typescript
// pino redact config:
redact: ['*.email', '*.password', '*.receiptData', '*.refreshToken']
// user_id displayed as: user-****-<last4 of UUID>
```

---

## §7 Redis Key Conventions

Redis is used for hot-path state that requires sub-millisecond access or atomic operations not available in PostgreSQL.

| Key Pattern | Type | TTL | Description |
|------------|------|-----|-------------|
| `game:jackpot:pool` | String (float) | Persistent (no TTL) | Current jackpot pool balance in gold coins. Incremented via `INCRBYFLOAT`. Claimed via Lua atomic GETDEL+SET. Persisted to PG every 5 min by cron and on room dispose. |
| `session:<token>` | String | 15 min | Access token session (used for token invalidation on logout) |
| `refresh:<token>` | String | 30 days | Refresh token validity (single-use; deleted on use) |
| `ratelimit:<ip>:<endpoint>` | Counter | 1 min window | Auth endpoint rate-limit counter (express-rate-limit Redis store) |
| `ratelimit:<userId>:<endpoint>` | Counter | 1 min window | Per-user rate-limit counter (IAP, profile update) |
| `email_confirm:<token>` | String | 86400 s (24 h) | `<userId>:<newEmail>` — email confirmation token for profile update flow |

**AOF persistence**: Redis must be configured with `appendonly yes` to survive crashes (risk R2 mitigation). PostgreSQL `jackpot_pool` table remains the authoritative source for recovery.
