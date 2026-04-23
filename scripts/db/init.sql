-- Fishing Arcade Game — Database Initialization
-- Run automatically by Docker on first postgres start
-- Also runnable manually: psql $DATABASE_URL -f scripts/db/init.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email                 BYTEA        NOT NULL,
    email_hash            BYTEA        NOT NULL UNIQUE,
    nickname              VARCHAR(50)  NOT NULL,
    password_hash         TEXT         NOT NULL,
    daily_gold_restore    BOOLEAN      NOT NULL DEFAULT TRUE,
    deletion_status       VARCHAR(20)  NOT NULL DEFAULT 'active'
                              CHECK (deletion_status IN ('active', 'pending', 'deleted')),
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- WALLETS
-- ============================================================
CREATE TABLE IF NOT EXISTS user_wallets (
    user_id    UUID    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    gold       BIGINT  NOT NULL DEFAULT 1000 CHECK (gold >= 0),
    diamond    INTEGER NOT NULL DEFAULT 0    CHECK (diamond >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL REFERENCES users(id),
    type       VARCHAR(20)  NOT NULL
                   CHECK (type IN ('earn', 'spend', 'iap', 'jackpot', 'refund', 'daily_restore')),
    amount     BIGINT       NOT NULL,
    currency   VARCHAR(10)  NOT NULL DEFAULT 'gold' CHECK (currency IN ('gold', 'diamond')),
    ref_id     TEXT,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- IAP RECEIPTS
-- ============================================================
CREATE TABLE IF NOT EXISTS iap_receipts (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID         NOT NULL REFERENCES users(id),
    receipt_hash VARCHAR(64)  NOT NULL UNIQUE,
    platform     VARCHAR(10)  NOT NULL CHECK (platform IN ('apple', 'google')),
    product_id   VARCHAR(100) NOT NULL,
    diamonds     INTEGER      NOT NULL CHECK (diamonds > 0),
    verified_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- JACKPOT
-- ============================================================
CREATE TABLE IF NOT EXISTS jackpot_pool (
    id             INTEGER  PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    current_amount BIGINT   NOT NULL DEFAULT 10000,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO jackpot_pool (id, current_amount) VALUES (1, 10000)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS jackpot_history (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    winner_id    UUID         NOT NULL REFERENCES users(id),
    amount       BIGINT       NOT NULL CHECK (amount > 0),
    triggered_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    room_id      VARCHAR(100)
);

-- ============================================================
-- GAME SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS game_sessions (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id      VARCHAR(100) NOT NULL,
    started_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    ended_at     TIMESTAMPTZ,
    ip_address   INET,
    player_ids   UUID[]       NOT NULL DEFAULT '{}',
    player_count INTEGER      NOT NULL DEFAULT 0,
    room_state   VARCHAR(20)  NOT NULL DEFAULT 'WAITING'
);

-- ============================================================
-- CONSENTS & PRIVACY
-- ============================================================
CREATE TABLE IF NOT EXISTS user_consents (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    consent_type   VARCHAR(100) NOT NULL
                       CHECK (consent_type IN ('privacy_policy', 'marketing')),
    granted        BOOLEAN      NOT NULL,
    granted_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    ip_address     INET,
    policy_version VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS deletion_requests (
    user_id       UUID        PRIMARY KEY REFERENCES users(id),
    requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scheduled_for TIMESTAMPTZ NOT NULL,
    executed_at   TIMESTAMPTZ,
    cancelled_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS privacy_policies (
    version      VARCHAR(20)  PRIMARY KEY,
    content_url  TEXT         NOT NULL,
    effective_at TIMESTAMPTZ  NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO privacy_policies (version, content_url, effective_at)
VALUES ('1.0.0', 'https://fishing-arcade.example.com/privacy/v1.0.0', NOW())
ON CONFLICT (version) DO NOTHING;

-- ============================================================
-- RTP LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS rtp_logs (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id      VARCHAR(100) NOT NULL,
    user_id      UUID         NOT NULL,
    fish_type    VARCHAR(20)  NOT NULL CHECK (fish_type IN ('normal', 'elite', 'boss')),
    bet_amount   BIGINT       NOT NULL CHECK (bet_amount > 0),
    payout       BIGINT       NOT NULL DEFAULT 0,
    hit          BOOLEAN      NOT NULL DEFAULT FALSE,
    rtp_at_time  NUMERIC(6,4),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_sessions_room ON game_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_started ON game_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_rtp_logs_room ON rtp_logs(room_id);
CREATE INDEX IF NOT EXISTS idx_rtp_logs_user ON rtp_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_rtp_logs_created ON rtp_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jackpot_history_winner ON jackpot_history(winner_id);
CREATE INDEX IF NOT EXISTS idx_user_consents_user ON user_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_scheduled ON deletion_requests(scheduled_for)
    WHERE executed_at IS NULL AND cancelled_at IS NULL;

-- ============================================================
-- SEED: test user for local dev (password: "testpass123")
-- email: test@example.com (stored as placeholder bytes for local dev)
-- ============================================================
-- NOTE: In real usage, email is AES-256-GCM encrypted bytes.
-- For local dev we store a plain marker so the server can boot without crypto keys.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE nickname = 'TestPlayer') THEN
    INSERT INTO users (id, email, email_hash, nickname, password_hash)
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      'local-dev-placeholder'::bytea,
      'local-dev-hash'::bytea,
      'TestPlayer',
      '$2b$10$YourBcryptHashHere.PlaceholderForLocalDev'
    );
    INSERT INTO user_wallets (user_id, gold, diamond)
    VALUES ('00000000-0000-0000-0000-000000000001', 50000, 100);
  END IF;
END $$;
