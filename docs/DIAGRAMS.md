# System Diagrams — Fishing Arcade Game

<!-- DOC-ID: DIAGRAMS-FISHING-ARCADE-GAME-20260422 -->
<!-- Parent: EDD-FISHING-ARCADE-GAME-20260422 / ARCH-FISHING-ARCADE-GAME-20260422 -->
<!-- Sources: docs/EDD.md v1.1, docs/ARCH.md v1.0, docs/API.md v1.0, docs/SCHEMA.md v1.0 -->
<!-- Generated: 2026-04-22 (devsop-autodev STEP-13) -->

---

## §1 Context & Component

### §1.1 System Context (C4)

```mermaid
C4Context
    title Fishing Arcade Game — System Context (C4 Level 1)

    Person(player, "Player", "Mobile gamer on iOS or Android who joins game rooms, shoots fish, and purchases diamonds via IAP")

    System(game, "Fishing Arcade Game", "Multiplayer real-time fishing arcade. Colyseus WebSocket server + Express REST API + Cocos Creator 4.x mobile client")

    System_Ext(appstore, "App Store (Apple)", "iOS IAP receipt validation endpoint")
    System_Ext(googleplay, "Google Play", "Android IAP purchase token validation API")
    System_Ext(firebase, "Firebase Analytics", "DAU, retention, and marketing event tracking (consent-gated)")

    Rel(player, game, "Plays via Cocos Creator mobile app", "wss:// + https://")
    Rel(game, appstore, "Validates Apple IAP receipts", "HTTPS POST verifyReceipt")
    Rel(game, googleplay, "Validates Google Play purchase tokens", "HTTPS purchases.products.get")
    Rel(game, firebase, "Sends analytics events", "Firebase SDK 10.x")
```

---

### §1.2 Component Architecture (C4)

```mermaid
C4Component
    title Fishing Arcade Game — Component Architecture (C4 Level 3)

    Container_Boundary(client, "Cocos Creator 4.x Client (iOS / Android)") {
        Component(boot, "Boot Scene", "TypeScript", "Init, orientation lock, landscape lock, persistent node setup")
        Component(netmgr, "NetworkManager", "TypeScript + Colyseus SDK", "WebSocket lifecycle, JWT refresh, reconnect strategy (max 3x exponential backoff)")
        Component(datamgr, "DataManager", "TypeScript singleton", "Player data cache, wallet state (gold/diamond); invalidated on logout/room leave")
        Component(gamescene, "GameRoom Scene", "TypeScript", "Fish/Bullet ObjectPools, Cannon state machine (IDLE→CHARGING→FIRING→COOLING)")
        Component(uimgr, "UILayer / ModalStack", "TypeScript", "HUD, NumberRoller, PrivacyConsentModal, JackpotOddsModal, AccountDeletionFlow")
        Component(a11y, "AccessibilityHelper", "TypeScript + jsb.reflection", "VoiceOver (iOS) / TalkBack (Android) bridge; WCAG AAA contrast")
        Component(secure, "SecureStorage", "TypeScript + jsb.reflection", "Refresh token storage: iOS Keychain / Android EncryptedSharedPreferences")
    }

    Container_Boundary(server, "Node.js Backend (Docker / Kubernetes 1.29)") {
        Component(colyseus, "Colyseus 0.15 Server", "Node.js + TypeScript", "Room lifecycle; state sync 20 Hz tick (50 ms); Schema v2 delta encoding")
        Component(gameroom, "GameRoom Handler", "TypeScript", "onJoin/onLeave/onMessage dispatch; maxClients = 4; 10 s reconnection window")
        Component(rtpeng, "RTP Engine", "TypeScript", "Integer-denominator CSPRNG (crypto.randomInt); dynamic hit-rate adjustment; BigInt accounting")
        Component(spawner, "Fish Spawner", "TypeScript", "Normal/Elite/Boss wave scheduling; deterministic Bezier path generation per fish ID")
        Component(jackpot, "Jackpot Manager", "TypeScript", "Global pool accumulation; Lua atomic GETDEL+SET; PostgreSQL persistence on dispose/restart")
        Component(iapverify, "IAP Verifier", "TypeScript", "Apple receipt + Google purchase token validation; idempotent diamond grant via receipt_hash")
        Component(walletdb, "Wallet Service", "TypeScript", "Atomic gold/diamond transactions; FOR UPDATE row lock; write-behind batch flush on dispose")
        Component(privacysvc, "Privacy Service", "TypeScript", "Consent records; 30-day soft-delete schedule; cron executeScheduledDeletions; PII anonymisation")
        Component(restapi, "REST API", "Express 4.x + TypeScript", "Auth, profile, IAP webhook, PDPA endpoints; Zod schema validation; OpenAPI via swagger-jsdoc")
    }

    Container_Boundary(data, "Data Layer") {
        ContainerDb(pg, "PostgreSQL 15", "RDBMS", "Users, wallets, transactions, consents, sessions — ACID guarantees; JSONB; 7-year audit retention")
        ContainerDb(redis, "Redis 7", "Cache / Atomic Counter", "Jackpot pool (INCRBYFLOAT); session tokens; rate-limit counters; email-confirm tokens (24 h TTL)")
    }

    Container_Boundary(infra, "Kubernetes Cluster (1.29)") {
        Component(ingress, "Nginx Ingress", "Ingress Controller", "TLS 1.3 termination; WebSocket upgrade; sticky-session cookie (colyseus-affinity); proxy timeout 3600 s")
        Component(hpa, "HPA", "autoscaling/v2", "CPU utilisation > 70% trigger; min 2 / max 5 replicas")
        Component(crons, "CronJobs", "Kubernetes CronJob", "deletion-executor (daily 02:00); jackpot-persist (*/5); wallet-reconcile (daily 03:00); ip-cleanup (daily 04:00); gold-restore (daily 06:00)")
    }

    Container_Boundary(external, "External Services") {
        Component(applestore, "App Store IAP", "HTTPS / Apple API", "Receipt validation endpoint")
        Component(googleplay, "Google Play IAP", "HTTPS / Google API", "purchases.products.get")
        Component(firebase, "Firebase Analytics", "SDK 10.x", "DAU, retention, event tracking; marketing_* events toggleable per consent")
    }

    Rel(boot, netmgr, "initializes")
    Rel(boot, secure, "stores refresh token")
    Rel(netmgr, colyseus, "WebSocket (Colyseus SDK)", "wss://")
    Rel(netmgr, restapi, "HTTP/REST", "https://")
    Rel(gamescene, netmgr, "state callbacks; send shoot/set_multiplier/start_game")
    Rel(uimgr, datamgr, "reads gold, diamond, nickname")
    Rel(netmgr, datamgr, "updates gold/diamond on state patch")
    Rel(colyseus, gameroom, "routes room messages")
    Rel(gameroom, rtpeng, "hit adjudication per shoot")
    Rel(gameroom, spawner, "fish wave control")
    Rel(gameroom, jackpot, "pool accumulation + tryTrigger")
    Rel(gameroom, walletdb, "debitGold / creditGold")
    Rel(restapi, iapverify, "POST /iap/verify")
    Rel(iapverify, applestore, "verifyReceipt HTTPS")
    Rel(iapverify, googleplay, "purchases.products.get HTTPS")
    Rel(iapverify, walletdb, "creditDiamond [idempotent]")
    Rel(restapi, privacysvc, "PDPA operations")
    Rel(walletdb, pg, "ACID transactions (FOR UPDATE)")
    Rel(jackpot, redis, "INCRBYFLOAT game:jackpot:pool; Lua atomic claim")
    Rel(jackpot, pg, "persist on trigger / server restart")
    Rel(gamescene, firebase, "logEvent()")
    Rel(ingress, colyseus, "WebSocket :2567")
    Rel(ingress, restapi, "REST :3000")
    Rel(hpa, gameroom, "scales pod count")
```

---

## §2 Sequence Diagrams

### §2.1 Player Join + Matchmaking

```mermaid
sequenceDiagram
    participant C as Cocos Client
    participant NG as Nginx Ingress
    participant API as REST API (Express)
    participant COL as Colyseus Server
    participant GR as GameRoom Handler
    participant WS as Wallet Service
    participant PG as PostgreSQL

    C->>NG: POST /api/v1/auth/login {email, password}
    NG->>API: forward
    API->>PG: SELECT users WHERE email_hash=$1
    PG-->>API: user row (bcrypt verify)
    API-->>C: 200 {accessToken (15 min), refreshToken (30 day)}
    C->>C: SecureStorage.set('refresh_token', ...)

    C->>NG: WebSocket upgrade → wss://game.example.com/
    NG->>COL: WebSocket (sticky cookie: colyseus-affinity)
    C->>COL: joinOrCreate('game_room', {token, nickname})
    COL->>GR: onAuth(client, options, request)
    GR->>GR: verifyJwt(token) — throws if invalid/expired
    GR-->>COL: payload {userId, role}
    COL->>GR: onJoin(client, options)
    GR->>WS: getGold(userId)
    WS->>PG: SELECT gold FROM user_wallets WHERE user_id=$1
    PG-->>WS: gold balance
    WS-->>GR: gold
    GR->>GR: assign slotIndex (0=BL, 1=BR, 2=TL, 3=TR)
    GR->>GR: state.players.set(sessionId, playerState)
    GR->>PG: INSERT game_sessions / UPDATE player_ids, player_count

    alt playerCount < 4 (players 1-3 joined)
        GR-->>C: Schema delta patch (new player added; roomState='WAITING')
        Note over C: Client shows WaitingOverlay "Waiting for players (N/4)"
    else playerCount == 4 (4th player triggers start)
        Note over GR: _transitionToPlaying() called
        GR->>GR: state.roomState = 'PLAYING'
        GR->>GR: FishSpawner.start() — begin normal wave schedule
        GR-->>C: Schema delta patch (all players; roomState='PLAYING')
        C->>C: UILayer hides WaitingOverlay; game begins
    end
```

---

### §2.2 Shoot → Adjudicate → Wallet

```mermaid
sequenceDiagram
    participant C as Cocos Client
    participant GR as GameRoom Handler
    participant RTP as RTP Engine
    participant JP as Jackpot Manager
    participant WS as Wallet Service
    participant PG as PostgreSQL
    participant RD as Redis

    C->>GR: send('shoot', {bulletId, fishId, betAmount, cannonMultiplier})

    GR->>GR: 0. Dedup check — bulletId in activeBullets Set?
    alt duplicate bulletId OR Set.size >= 10
        GR->>GR: silently drop (rate-limit / dedup)
    else new bullet
        GR->>GR: activeBullets.add(bulletId)
        GR->>GR: 1. Validate: player.gold >= betAmount
        GR->>GR: 2. Validate: fishId exists and alive in state.fish

        alt validation fails
            GR-->>C: send('shoot_error', {code: 'INVALID_SHOOT', reason})
            GR->>GR: activeBullets.delete(bulletId)
        else validation passes
            GR->>WS: debitGold(userId, betAmount)
            WS->>PG: BEGIN; SELECT gold FOR UPDATE; UPDATE -betAmount; INSERT transactions; COMMIT
            PG-->>WS: OK
            WS-->>GR: OK
            GR->>GR: state.players.get(sessionId).gold -= betAmount

            GR->>RTP: adjudicate(fishType, betAmount, cannonMultiplier)
            RTP->>RTP: _dynamicAdjust(fishCfg) — scale hitRateNumerator if RTP drifts
            RTP->>RTP: roll = crypto.randomInt(denominator)
            RTP-->>GR: {hit: boolean, payout: number}

            alt hit == true
                GR->>GR: FishState.hp -= 1
                alt hp == 0 (fish killed)
                    GR->>WS: creditGold(userId, payout, 'earn')
                    WS->>PG: BEGIN; UPDATE gold +payout; INSERT transactions; COMMIT
                    GR->>GR: state.players.get(sessionId).gold += payout
                    GR->>GR: state.fish.delete(fishId) — auto-broadcasts delta
                else hp > 0
                    Note over GR,C: HP decrement auto-synced via schema delta patch
                end

                GR->>JP: tryTrigger(cannonMultiplier, userId)
                JP->>JP: odds = JACKPOT_ODDS[multiplier]; roll = crypto.randomInt(odds)
                alt jackpot triggered (roll == 0)
                    JP->>RD: EVAL Lua: GETDEL game:jackpot:pool; SET game:jackpot:pool SEED
                    RD-->>JP: poolAmount string
                    JP->>PG: BEGIN; INSERT jackpot_history; UPDATE user_wallets +poolAmount; INSERT transactions('jackpot'); COMMIT
                    JP-->>GR: {winnerId, amount}
                    GR->>GR: state.players.get(sessionId).gold += jackpotAmount
                    GR->>RTP: addExternalPayout(jackpotAmount)
                    GR->>GR: broadcast('jackpot_won', {winnerId, amount})
                    GR-->>C: message jackpot_won → celebration animation
                else no jackpot
                    JP-->>GR: null
                end
            else hit == false (miss)
                Note over GR,C: Gold already debited; no payout; no fish state change
            end

            GR->>PG: INSERT rtp_logs (fire-and-forget)
            GR-->>C: send('shoot_result', {hit, payout})
            GR->>GR: activeBullets.delete(bulletId)
        end
    end
```

---

### §2.3 IAP Purchase

```mermaid
sequenceDiagram
    participant C as Cocos Client
    participant Store as App Store / Google Play
    participant NG as Nginx Ingress
    participant API as REST API (Express)
    participant IAP as IAP Verifier
    participant WS as Wallet Service
    participant PG as PostgreSQL

    C->>Store: purchaseProduct(productId)
    Store-->>C: receipt / purchaseToken

    C->>NG: POST /api/v1/iap/verify {platform, receipt, productId}
    Note over C,NG: Auth: Bearer accessToken (JWT RS256)
    NG->>API: forward (rate limit: 5 req/min per user)
    API->>IAP: verifyReceipt(platform, receipt, productId)

    alt platform == 'apple'
        IAP->>Store: POST verifyReceipt (sandbox → production fallback)
        Store-->>IAP: {status, receipt, in_app[]}
    else platform == 'google'
        IAP->>Store: purchases.products.get(packageName, productId, purchaseToken)
        Store-->>IAP: {purchaseState, consumptionState}
    end

    IAP->>IAP: extract diamondAmount from product catalog
    IAP->>IAP: receiptHash = SHA-256(receipt)
    IAP->>WS: creditDiamond(userId, amount, receiptHash, platform, productId)

    WS->>PG: BEGIN
    WS->>PG: SELECT id FROM iap_receipts WHERE receipt_hash=$1
    alt receipt already processed (idempotent)
        PG-->>WS: existing row
        WS->>WS: skip — no double credit
        Note over WS,API: Returns 200 with current balance
    else new receipt
        PG-->>WS: empty
        WS->>PG: INSERT iap_receipts(user_id, receipt_hash, platform, product_id, diamond_amt)
        WS->>PG: UPDATE user_wallets SET diamond = diamond + $1
        WS->>PG: INSERT transactions(user_id, 'iap', amount, 'diamond')
        WS->>PG: COMMIT
    end
    WS-->>API: current diamond balance
    API-->>C: 200 {diamond: newBalance, gold: currentGold}

    Note over C: Client retries up to 3x with exponential backoff on network error
```

---

### §2.4 PDPA Account Deletion Flow

```mermaid
sequenceDiagram
    participant C as Cocos Client
    participant API as REST API (Express)
    participant PS as Privacy Service
    participant PG as PostgreSQL
    participant CJ as CronJob (deletion-executor)

    C->>API: POST /api/v1/privacy/account/delete
    Note over C,API: Auth: Bearer accessToken (JWT RS256)
    API->>PS: requestDeletion(userId)
    PS->>PG: SELECT deletion_status FROM users WHERE id=$1
    PG-->>PS: deletion_status
    alt already pending or deleted
        PS-->>API: 409 Conflict
        API-->>C: 409 {error: 'DELETION_ALREADY_REQUESTED'}
    else active account
        PS->>PG: UPDATE users SET deletion_status='pending', deletion_requested_at=NOW()
        PS->>PG: INSERT deletion_requests(user_id, requested_at, scheduled_for=NOW()+30days)
        PG-->>PS: OK
        PS-->>API: OK
        API-->>C: 200 {message: 'Deletion scheduled', scheduledFor: ISO8601}
    end

    Note over CJ: CronJob runs daily at 02:00 UTC

    CJ->>PS: executeScheduledDeletions()
    PS->>PG: SELECT user_id FROM deletion_requests WHERE scheduled_for <= NOW() AND executed_at IS NULL AND cancelled_at IS NULL
    PG-->>PS: list of user_ids due for deletion

    loop for each user_id
        PS->>PG: BEGIN
        PS->>PG: UPDATE users SET email=ANONYMISED, email_hash=ANONYMISED, nickname='deleted_user', deletion_status='deleted'
        PS->>PG: UPDATE deletion_requests SET executed_at=NOW() WHERE user_id=$1
        PS->>PG: COMMIT
        Note over PS,PG: transactions/iap_receipts/jackpot_history rows retained (7-yr financial law)
        Note over PS,PG: user_consents rows retained (PDPA evidence)
    end
```

---

## §3 State Machines

### §3.1 GameRoom State Machine

```mermaid
stateDiagram-v2
    [*] --> WAITING : onCreate()\nINSERT game_sessions\nFishSpawner paused\n20 Hz tick starts

    WAITING --> PLAYING : playerCount >= 4\n_transitionToPlaying()\nstate.roomState = 'PLAYING'\nFishSpawner.start()

    WAITING --> ENDED : onDispose()\n(all players left before full)

    PLAYING --> BOSS_BATTLE : FishSpawner schedules Boss\n_spawnBoss(bossState)\nstate.roomState = 'BOSS_BATTLE'\n60 s escape timer starts

    BOSS_BATTLE --> PLAYING : Boss killed (hp == 0)\n_onBossKilled(fishId)\nclearTimeout(escapeTimer)\nstate.roomState = 'PLAYING'

    BOSS_BATTLE --> PLAYING : Boss escaped (timeout 60 s)\nboss removed from state.fish\nbroadcast('boss_escaped')\nstate.roomState = 'PLAYING'

    PLAYING --> ENDED : All players leave\nonDispose() triggered

    BOSS_BATTLE --> ENDED : All players leave\nonDispose() triggered

    ENDED --> [*] : onDispose() completes\nJackpotManager.persistPool()\nWalletService.flushBatch()\nUPDATE game_sessions SET ended_at\nclearInterval(_tickInterval)\n_disposed = true

    note right of WAITING
        players: 0-3
        FishSpawner: paused
        20 Hz tick: running
        Partial leave: immediate remove
    end note

    note right of PLAYING
        players: 1-4 (partial leave: 10 s reconnect window)
        Normal + Elite fish active
        Jackpot pool accumulating
        20 Hz tick: running
    end note

    note right of BOSS_BATTLE
        Boss fish in state.fish
        60 s escape countdown active
        All players can shoot boss
        20 Hz tick: running
    end note

    note right of ENDED
        _disposed = true
        _tickInterval cleared
        All boss escape timers cleared
        jackpot_won overlay: broadcast event only (not a separate room state)
    end note
```

---

### §3.2 NetworkManager State Machine

```mermaid
stateDiagram-v2
    [*] --> DISCONNECTED : app launch / logout

    DISCONNECTED --> CONNECTING : joinOrCreate() called\nJWT loaded from SecureStorage

    CONNECTING --> CONNECTED : Colyseus handshake OK\nonJoin() received\nstate patches streaming

    CONNECTING --> DISCONNECTED : connection refused\nor JWT invalid (401)\nmax retries exceeded

    CONNECTED --> RECONNECTING : unexpected WebSocket close\n(code != 1000)\nreconnect attempt 1

    RECONNECTING --> RECONNECTED : allowReconnection() succeeds\nwithin 10 s window\nstate re-synced

    RECONNECTING --> RECONNECTING : retry (exponential backoff)\nattempt 2, attempt 3

    RECONNECTING --> FAILED : 3 retries exhausted\nor 10 s window expired

    RECONNECTED --> CONNECTED : room state fully synced\nnormal gameplay resumes

    FAILED --> DISCONNECTED : show error toast\nclear room state\nreturn to lobby

    CONNECTED --> DISCONNECTED : intentional leave\n(code 1000)\nonLeave called cleanly

    note right of CONNECTING
        JWT refresh attempted if
        accessToken near expiry
        (< 60 s remaining)
    end note

    note right of RECONNECTING
        Colyseus server holds
        player slot for 10 s
        Room stays PLAYING
        during reconnect window
    end note
```

---

## §4 Entity Relationships

### §4.1 Database ER Diagram

```mermaid
erDiagram
    users {
        UUID id PK
        BYTEA email "AES-256-GCM encrypted"
        BYTEA email_hash UK "HMAC-SHA256 for uniqueness lookup"
        VARCHAR50 nickname
        TEXT password_hash "bcrypt"
        VARCHAR64 device_id "SHA-256 hash; original never stored"
        VARCHAR20 deletion_status "active|pending|deleted"
        TIMESTAMPTZ deletion_requested_at
        TIMESTAMPTZ created_at
        TIMESTAMPTZ updated_at
    }

    user_wallets {
        UUID user_id PK_FK "1:1 with users; CASCADE DELETE"
        BIGINT gold "CHECK >= 0"
        INTEGER diamond "CHECK >= 0"
        TIMESTAMPTZ updated_at
    }

    transactions {
        UUID id PK
        UUID user_id FK "no ON DELETE — user row never hard-deleted"
        VARCHAR20 type "earn|spend|iap|jackpot|refund|daily_restore"
        BIGINT amount "positive=credit; negative=debit"
        VARCHAR10 currency "gold|diamond"
        UUID ref_id "optional: session_id or receipt_id"
        TIMESTAMPTZ created_at
    }

    iap_receipts {
        UUID id PK
        UUID user_id FK "no ON DELETE — receipts retained 7 yrs"
        VARCHAR64 receipt_hash UK "SHA-256 hex; idempotency key"
        VARCHAR10 platform "apple|google"
        VARCHAR100 product_id
        INTEGER diamond_amt "CHECK > 0"
        TIMESTAMPTZ created_at
    }

    jackpot_pool {
        INTEGER id PK "singleton; CHECK id = 1"
        BIGINT current_amount "seed = 10000 gold"
        TIMESTAMPTZ updated_at
    }

    jackpot_history {
        UUID id PK
        UUID winner_id FK "no ON DELETE — retained 7 yrs"
        BIGINT amount "CHECK > 0"
        TIMESTAMPTZ triggered_at
        VARCHAR100 room_id
    }

    game_sessions {
        UUID id PK
        VARCHAR100 room_id
        TIMESTAMPTZ started_at
        TIMESTAMPTZ ended_at
        INET ip_address "NULLed after 90 days by ip-cleanup cron"
        UUID_ARRAY player_ids
        INTEGER player_count
        VARCHAR20 room_state "WAITING|PLAYING|ENDED"
    }

    user_consents {
        UUID id PK
        UUID user_id FK "ON DELETE RESTRICT — PDPA evidence"
        VARCHAR100 consent_type "privacy_policy|marketing"
        BOOLEAN granted
        TIMESTAMPTZ granted_at
        TIMESTAMPTZ revoked_at "NULL = not revoked"
        VARCHAR20 policy_version "soft ref to privacy_policies.version"
        INET ip_address
        TEXT user_agent
        TIMESTAMPTZ created_at
    }

    deletion_requests {
        UUID user_id PK_FK "one pending request per user"
        TIMESTAMPTZ requested_at
        TIMESTAMPTZ scheduled_for "requested_at + 30 days"
        TIMESTAMPTZ executed_at "set by executeScheduledDeletions cron"
        TIMESTAMPTZ cancelled_at "set by cancelDeletion API"
    }

    privacy_policies {
        VARCHAR20 version PK "semver e.g. 1.0.0"
        TEXT content_url
        TIMESTAMPTZ effective_at
        TIMESTAMPTZ created_at
    }

    rtp_logs {
        UUID id PK
        VARCHAR100 room_id
        UUID user_id "no FK — user row may be anonymised; UUID retained"
        VARCHAR20 fish_type "normal|elite|boss"
        BIGINT bet_amount "CHECK > 0"
        INTEGER multiplier "CHECK > 0"
        BOOLEAN hit
        BIGINT payout "DEFAULT 0"
        NUMERIC rtp_at_time "5,4 precision — running RTP at adjudication time"
        TIMESTAMPTZ created_at
    }

    users ||--|| user_wallets : "owns (CASCADE)"
    users ||--o{ transactions : "records"
    users ||--o{ iap_receipts : "purchases"
    users ||--o{ jackpot_history : "wins"
    users ||--o{ user_consents : "grants (RESTRICT)"
    users ||--o| deletion_requests : "schedules (RESTRICT)"
```

---

## §5 Class Diagrams

### §5.1 Server Core Classes

```mermaid
classDiagram
    class GameRoom {
        +maxClients: number = 4
        -_rtpEngine: RTPEngine
        -_fishSpawner: FishSpawner
        -_jackpotManager: JackpotManager
        -_activeBullets: Map~string, Set~string~~
        -_bossEscapeTimers: Map~string, NodeJS.Timeout~
        -_tickInterval: NodeJS.Timeout
        -_disposed: boolean
        +onCreate(options) Promise~void~
        +onAuth(client, options, request) Promise~AuthPayload~
        +onJoin(client, options) Promise~void~
        +onLeave(client, code) Promise~void~
        +onDispose() Promise~void~
        -_handleShoot(client, data) void
        -_handleSetMultiplier(client, data) void
        -_handleStartGame(client, data) void
        -_transitionToPlaying() void
        -_spawnBoss(bossState) void
        -_onBossKilled(fishId) void
        -_tick() void
        -_assignSlot() number
    }

    class RTPEngine {
        -_totalBet: bigint
        -_totalPaid: bigint
        -_config: RTPConfig
        +currentRtp: number
        +constructor(config: RTPConfig)
        +adjudicate(fishType, betAmount, multiplier) HitResult
        +addExternalPayout(amount) void
        -_dynamicAdjust(cfg: FishConfig) number
    }

    class JackpotManager {
        -static _instance: JackpotManager
        -_redis: RedisClient
        +static getInstance() Promise~JackpotManager~
        +tryTrigger(multiplier, userId) Promise~JackpotResult | null~
        +persistPool() Promise~void~
        +accumulateContribution(amount) Promise~void~
    }

    class WalletService {
        +static getGold(userId) Promise~number~
        +static debitGold(userId, amount) Promise~void~
        +static creditGold(userId, amount, type) Promise~void~
        +static creditDiamond(userId, amount, receiptHash, platform, productId) Promise~number~
        +static flushBatch() Promise~void~
        +static restoreDailyGold() Promise~void~
    }

    class PrivacyService {
        +requestDeletion(userId) Promise~DeletionResponse~
        +cancelDeletion(userId) Promise~void~
        +executeScheduledDeletions() Promise~number~
        +recordConsent(userId, consentType, granted, policyVersion) Promise~void~
        +getConsents(userId) Promise~ConsentRecord[]~
    }

    class FishSpawner {
        -_state: GameState
        -_broadcast: BroadcastFn
        -_normalWaveTimer: NodeJS.Timeout
        -_eliteWaveTimer: NodeJS.Timeout
        -_bossWaveTimer: NodeJS.Timeout
        +start() void
        +stop() void
        +spawnNormalWave() void
        +spawnEliteFish() void
        +spawnBoss() FishState
        -_generateBezierPath(fishId) string
    }

    GameRoom --> RTPEngine : uses
    GameRoom --> JackpotManager : uses
    GameRoom --> WalletService : uses
    GameRoom --> FishSpawner : owns
    JackpotManager --> WalletService : credits on jackpot
```

---

### §5.2 Colyseus Schema Classes

```mermaid
classDiagram
    class Schema {
        <<abstract>>
        +encode() Buffer
        +decode(buffer) void
    }

    class PlayerState {
        +playerId: string
        +nickname: string
        +gold: number
        +multiplier: number
        +isConnected: boolean
        +slotIndex: number
    }

    class FishState {
        +fishId: string
        +fishType: string
        +hp: number
        +maxHp: number
        +posX: number
        +posY: number
        +rewardMultiplier: number
        +alive: boolean
        +pathData: string
        +speed: number
    }

    class BulletState {
        +bulletId: string
        +ownerId: string
        +originX: number
        +originY: number
        +targetX: number
        +targetY: number
        +multiplier: number
    }

    class GameState {
        +roomState: string
        +players: MapSchema~PlayerState~
        +fish: MapSchema~FishState~
        +bullets: MapSchema~BulletState~
        +jackpotPool: number
        +activeBossHp: number
        +activeBossMaxHp: number
        +roomId: string
        +playerCount: number
        +rtpNumerator: number
    }

    Schema <|-- PlayerState : extends
    Schema <|-- FishState : extends
    Schema <|-- BulletState : extends
    Schema <|-- GameState : extends
    GameState "1" --> "0..4" PlayerState : players MapSchema
    GameState "1" --> "0..50" FishState : fish MapSchema
    GameState "1" --> "0..40" BulletState : bullets MapSchema

    note for PlayerState "@type decorators from @colyseus/schema v2\nslotIndex: 0=BL 1=BR 2=TL 3=TR\nmultiplier: cannon power 1-100"
    note for FishState "pathData: JSON-encoded Bezier\ncontrol points [{x,y}...]\nDeterministic path per fishId"
    note for GameState "roomState: WAITING|PLAYING|BOSS_BATTLE|ENDED\nrtpNumerator: refreshed on every 20 Hz tick\njackpotPool: mirrored from Redis"
```

---

## §6 Flowcharts

### §6.1 Bullet Hit Detection

```mermaid
flowchart TD
    A([Client sends shoot message]) --> B{bulletId already\nin activeBullets Set?}
    B -- yes --> C([Silently drop — duplicate])
    B -- no --> D{activeBullets\nSet.size >= 10?}
    D -- yes --> E([Silently drop — rate limit])
    D -- no --> F[activeBullets.add bulletId]
    F --> G{player.gold\n>= betAmount?}
    G -- no --> H([send shoot_error INVALID_SHOOT\nactiveBullets.delete bulletId])
    G -- yes --> I{fishId exists\nand alive?}
    I -- no --> H
    I -- yes --> J[WalletService.debitGold\natomic FOR UPDATE]
    J --> K[RTPEngine.adjudicate\nfishType, betAmount, multiplier]
    K --> L[_dynamicAdjust hitRateNumerator\nbased on running RTP]
    L --> M[roll = crypto.randomInt\ndenominator]
    M --> N{roll < adjustedNumerator?}
    N -- miss --> O[No payout\nno fish state change]
    N -- hit --> P[FishState.hp -= 1]
    P --> Q{hp == 0?}
    Q -- no --> R[HP auto-synced via\nColyseus schema delta]
    Q -- yes --> S[WalletService.creditGold\npayout to player]
    S --> T[state.fish.delete fishId\nauto-broadcasts to all clients]
    O --> U[JackpotManager.tryTrigger\ncannonMultiplier, userId]
    R --> U
    T --> U
    U --> V{jackpot\ntriggered?}
    V -- yes --> W[Lua atomic GETDEL+SET\nclaim pool from Redis]
    W --> X[INSERT jackpot_history\nUPDATE user_wallets\nbroadcast jackpot_won]
    V -- no --> Y[INSERT rtp_logs\nfire-and-forget]
    X --> Y
    Y --> Z([send shoot_result hit/miss payout\nactiveBullets.delete bulletId])
```

---

### §6.2 RTP Dynamic Adjustment

```mermaid
flowchart TD
    A([_dynamicAdjust called\nwith FishConfig]) --> B{_totalBet <\nMIN_SAMPLE_BETS × MIN_BET?}
    B -- yes --> C([Return base hitRateNumerator\ninsufficient sample — no adjustment])
    B -- no --> D[Calculate currentRtp =\n_totalPaid × 10000 / _totalBet / 10000]
    D --> E{currentRtp >\ntargetRtpMax 0.96?}
    E -- yes --> F[scale = targetRtpMax / currentRtp\nadjusted = floor hitRateNumerator × scale]
    F --> G([Return reduced numerator\nfewer hits — bring RTP down])
    E -- no --> H{currentRtp <\ntargetRtpMin 0.92?}
    H -- yes --> I[scale = targetRtpMin / currentRtp\nadjusted = min floor × scale, denominator - 1]
    I --> J([Return increased numerator\nmore hits — bring RTP up])
    H -- no --> K([Return base hitRateNumerator\nRTP within target band 0.92-0.96])
```

---

## §7 Project Timeline

### §7.1 Development Phases Gantt

```mermaid
gantt
    title Fishing Arcade Game — Development Phases
    dateFormat YYYY-MM-DD
    axisFormat %b %Y

    section Phase 1 — Core Foundation (Month 1-2)
    Colyseus room lifecycle + state schema    :p1a, 2026-05-01, 14d
    RTP Engine + 100K simulation CI gate      :p1b, after p1a, 10d
    Wallet Service + PostgreSQL ACID txns     :p1c, after p1a, 14d
    Fish spawner + Bezier path generation     :p1d, after p1b, 10d
    REST API auth endpoints (JWT RS256)       :p1e, 2026-05-01, 14d
    Cocos Creator boot + NetworkManager       :p1f, 2026-05-01, 21d
    GameRoom scene + ObjectPool               :p1g, after p1f, 14d
    k6 WebSocket pressure test gate           :milestone, p1m, after p1d, 0d

    section Phase 2 — Jackpot + IAP + PDPA (Month 3-4)
    Jackpot Manager (Redis Lua + PG persist)  :p2a, 2026-07-01, 14d
    IAP Verifier Apple + Google               :p2b, 2026-07-01, 14d
    PDPA Privacy Service + deletion cron      :p2c, after p2a, 14d
    User consent modal + AccountDeletionFlow  :p2d, after p2b, 10d
    Boss fish + 60 s escape timer             :p2e, after p2a, 10d
    Jackpot UI (NumberRoller + celebration)   :p2f, after p2e, 7d
    CronJobs (deletion, reconcile, ip-clean)  :p2g, after p2c, 7d
    IAP + PDPA integration test suite         :milestone, p2m, after p2g, 0d

    section Phase 3 — Polish + k8s + Performance (Month 5-6)
    Cocos Creator visual polish + Spine anim  :p3a, 2026-09-01, 21d
    AccessibilityHelper VoiceOver TalkBack    :p3b, 2026-09-01, 14d
    Kubernetes manifests HPA + PDB + NetPol   :p3c, 2026-09-01, 14d
    Prometheus metrics + Pino structured logs :p3d, after p3c, 7d
    End-to-end test suite (Playwright)        :p3e, after p3a, 14d
    Performance profiling + Low-End Mode      :p3f, after p3a, 10d
    Security audit + penetration test         :p3g, after p3d, 7d
    Production launch readiness review        :milestone, p3m, after p3g, 0d
```
