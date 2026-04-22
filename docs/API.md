# API Reference Document — Fishing Arcade Game

<!-- DOC-ID: API-FISHING-ARCADE-GAME-20260422 -->
<!-- Parent: EDD-FISHING-ARCADE-GAME-20260422 (docs/EDD.md) -->
<!-- Stack: Express 4.x + TypeScript; Colyseus 0.15 WebSocket -->

---

## Document Control

| Field | Content |
|-------|---------|
| **DOC-ID** | API-FISHING-ARCADE-GAME-20260422 |
| **Project** | fishing-arcade-game |
| **Version** | v1.0 |
| **Status** | DRAFT |
| **Source** | EDD v1.5 §2.5 (IN_REVIEW) |
| **Base URL** | `https://game.example.com` |
| **Date** | 2026-04-22 |

---

## §1 REST API Overview

All REST endpoints are versioned under `/api/v1/`. Authentication uses **JWT RS256** (Bearer token).

### §1.1 Base URL

```
https://game.example.com/api/v1/
```

### §1.2 Authentication

| Token Type | Algorithm | TTL | Storage |
|-----------|-----------|-----|---------|
| Access Token | RS256 JWT | 15 minutes | In-memory (not localStorage) |
| Refresh Token | RS256 JWT | 30 days | iOS: Keychain (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`); Android: EncryptedSharedPreferences (Keystore); Web: HTTP-only cookie |

**Authorization header:**
```
Authorization: Bearer <accessToken>
```

**Token rotation**: Refresh tokens are single-use. On `POST /api/v1/auth/refresh`, the old refresh token is immediately invalidated and a new pair is issued.

**JWT claims** (never include PII beyond userId):
```json
{
  "sub": "<userId UUID>",
  "role": "player",
  "iat": 1745000000,
  "exp": 1745000900
}
```

### §1.3 Standard Error Response Format

All endpoints return this envelope on error:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```

Standard HTTP status codes:

| Code | Meaning |
|------|---------|
| 400 | Validation error (Zod schema rejection) |
| 401 | Unauthenticated (missing or expired token) |
| 403 | Forbidden (insufficient role or business rule: no withdrawal) |
| 409 | Conflict / state error (email taken, deletion not cancellable) |
| 422 | Business rule violation |
| 429 | Rate limit exceeded |
| 500 | Internal server error (never exposes stack traces or SQL) |

Error messages never expose stack traces, SQL errors, or internal system details.

---

## §2 Endpoint Reference

### §2.1 Full Endpoint Table

| Method | Path | Auth | Description | US-ID |
|--------|------|------|-------------|-------|
| POST | `/api/v1/auth/register` | None | Email + password register; issue JWT pair | — |
| POST | `/api/v1/auth/login` | None | Login; issue JWT pair | — |
| POST | `/api/v1/auth/refresh` | Refresh JWT | Rotate token pair | — |
| GET | `/api/v1/user/profile` | JWT | Get nickname, masked email, wallet balances | — |
| PATCH | `/api/v1/user/profile` | JWT | Update nickname / initiate email change | US-PRIV-003 |
| GET | `/api/v1/user/wallet` | JWT | Gold + diamond balance | US-CURR-001 |
| POST | `/api/v1/iap/verify` | JWT | Verify Apple/Google receipt; credit diamond | US-CURR-002 |
| GET | `/api/v1/privacy/consents` | JWT | List user's consent records | US-PRIV-001 |
| POST | `/api/v1/privacy/consent/grant` | JWT | Grant a consent type | US-PRIV-001 |
| POST | `/api/v1/privacy/consent/revoke` | JWT | Revoke marketing consent | US-PRIV-004 |
| POST | `/api/v1/privacy/account/delete` | JWT | Submit deletion request (30-day schedule) | US-PRIV-002 |
| DELETE | `/api/v1/privacy/account/delete` | JWT | Cancel pending deletion | US-PRIV-002 |
| GET | `/api/v1/game/jackpot` | JWT | Current jackpot pool amount | US-JACK-001 |
| GET | `/api/v1/game/jackpot/odds` | None (public) | Jackpot odds table for disclosure | US-JACK-002 |
| GET | `/health` | None | Liveness probe (k8s livenessProbe) | — |
| GET | `/health/ready` | None | Readiness probe — 200 only after DB+Redis connected | — |

---

### §2.2 Auth Endpoints

#### POST `/api/v1/auth/register`

Register a new player account.

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "MyPass1!",
  "nickname": "阿凱"
}
```

**Validation rules:**
- `email`: RFC 5322 format
- `password`: ≥ 8 characters, ≥ 1 uppercase letter, ≥ 1 digit
- `nickname`: non-empty, ≤ 50 characters

**Response 201:**
```json
{
  "accessToken": "<JWT>",
  "refreshToken": "<JWT>",
  "expiresIn": 900
}
```

**Error responses:**
| Code | Error Code | Description |
|------|-----------|-------------|
| 400 | `validation_error` | Invalid email format, weak password, or empty nickname |
| 409 | `email_taken` | Email already registered |

**Example 400:**
```json
{
  "error": {
    "code": "validation_error",
    "message": "Validation failed",
    "details": { "field": "email", "message": "invalid format" }
  }
}
```

---

#### POST `/api/v1/auth/login`

Authenticate and issue JWT pair.

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "MyPass1!"
}
```

**Response 200:**
```json
{
  "accessToken": "<JWT>",
  "refreshToken": "<JWT>",
  "expiresIn": 900
}
```

**Error responses:**
| Code | Error Code | Description |
|------|-----------|-------------|
| 401 | `invalid_credentials` | Email or password incorrect (generic — does not distinguish email-not-found vs wrong password) |

---

#### POST `/api/v1/auth/refresh`

Rotate the JWT pair using a valid refresh token.

**Request body:**
```json
{
  "refreshToken": "<JWT>"
}
```

**Response 200:**
```json
{
  "accessToken": "<JWT>",
  "refreshToken": "<JWT>",
  "expiresIn": 900
}
```
Old refresh token is immediately invalidated (single-use rotation).

**Error responses:**
| Code | Error Code | Description |
|------|-----------|-------------|
| 401 | `invalid_refresh_token` | Token expired, already used, or invalid signature |

---

### §2.3 User Endpoints

#### GET `/api/v1/user/profile`

Retrieve current player's profile and wallet summary.

**Auth:** Bearer JWT

**Response 200:**
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "nickname": "阿凱",
  "email": "u***@example.com",
  "deletionStatus": "active",
  "wallet": {
    "gold": 50000,
    "diamond": 10
  }
}
```

---

#### PATCH `/api/v1/user/profile`

Update nickname or initiate email change (US-PRIV-003).

**Auth:** Bearer JWT

**Request body (fields optional):**
```json
{
  "nickname": "新暱稱",
  "email": "newemail@example.com"
}
```

**Validation rules:**
- `nickname`: ≤ 50 characters, non-empty if provided
- `email`: RFC 5322 format; must be unique

**Behaviour:**
- `nickname`: updated immediately; broadcast to Colyseus room via `GameRoom.broadcast`
- `email`: server sends confirmation email to new address; update is effective only after confirmation link clicked (24 h TTL token stored in Redis)

**Response 200:**
```json
{
  "success": true,
  "message": "Nickname updated. Email confirmation sent to new address."
}
```

**Error responses:**
| Code | Error Code | Description |
|------|-----------|-------------|
| 400 | `validation_error` | Invalid nickname or email format |
| 409 | `email_taken` | New email already in use |

---

#### GET `/api/v1/user/wallet`

Retrieve current gold and diamond balances (US-CURR-001).

**Auth:** Bearer JWT

**Response 200:**
```json
{
  "gold": 50000,
  "diamond": 10,
  "updatedAt": "2026-04-22T12:00:00Z"
}
```

---

### §2.4 IAP Endpoint

#### POST `/api/v1/iap/verify`

Verify Apple or Google purchase receipt and credit diamonds (US-CURR-002).

**Auth:** Bearer JWT

**Request body:**
```json
{
  "platform": "apple",
  "receipt": "<base64-encoded receipt data>",
  "productId": "diamond_pack_100"
}
```

| Field | Type | Values |
|-------|------|--------|
| `platform` | string | `"apple"` \| `"google"` |
| `receipt` | string | Base64 receipt (Apple) or purchase token string (Google) |
| `productId` | string | Product ID from store catalog |

**Response 200** (idempotent — repeat submissions return same 200):
```json
{
  "success": true,
  "diamondGranted": 100,
  "wallet": {
    "gold": 50000,
    "diamond": 110
  }
}
```

**Error responses:**
| Code | Error Code | Description |
|------|-----------|-------------|
| 400 | `validation_error` | Missing or invalid fields |
| 402 | `invalid_receipt` | Store rejected the receipt |
| 429 | `rate_limited` | Exceeds 5 req/min per user |

**Idempotency**: Server deduplicates via `SHA-256(receipt)` stored in `iap_receipts.receipt_hash`. Duplicate submissions return 200 with current balance without double-crediting.

**Retry guidance**: Client retries up to 3 times with exponential backoff on network error. Balance update SLA: ≤ 2 seconds.

---

### §2.5 Privacy / PDPA Endpoints

#### GET `/api/v1/privacy/consents`

List all consent records for the authenticated user (US-PRIV-001).

**Auth:** Bearer JWT

**Response 200:**
```json
{
  "consents": [
    {
      "id": "uuid",
      "consentType": "privacy_policy",
      "granted": true,
      "grantedAt": "2026-04-22T10:00:00Z",
      "revokedAt": null,
      "policyVersion": "1.0.0"
    },
    {
      "id": "uuid",
      "consentType": "marketing",
      "granted": false,
      "grantedAt": null,
      "revokedAt": "2026-04-22T11:00:00Z",
      "policyVersion": "1.0.0"
    }
  ]
}
```

---

#### POST `/api/v1/privacy/consent/grant`

Grant a consent type (US-PRIV-001).

**Auth:** Bearer JWT

**Request body:**
```json
{
  "consentType": "privacy_policy",
  "policyVersion": "1.0.0"
}
```

| Field | Values |
|-------|--------|
| `consentType` | `"privacy_policy"` \| `"marketing"` |
| `policyVersion` | semver string matching `privacy_policies.version` |

**Response 200:**
```json
{ "success": true }
```

---

#### POST `/api/v1/privacy/consent/revoke`

Revoke a consent type (US-PRIV-004).

**Auth:** Bearer JWT

**Request body:**
```json
{
  "consentType": "marketing"
}
```

**Behaviour:**
- `marketing`: inserts revocation record; returns 200; client must disable Firebase `marketing_*` events
- `privacy_policy`: server returns **409** with redirect to account deletion flow (PDPA mandatory — cannot revoke privacy policy without deleting account)

**Response 200** (marketing consent):
```json
{ "success": true }
```

**Error responses:**
| Code | Error Code | Description |
|------|-----------|-------------|
| 409 | `consent_not_revocable` | Attempt to revoke `privacy_policy`; body includes `{ "redirect": "account_deletion" }` |

---

#### POST `/api/v1/privacy/account/delete`

Submit account deletion request (30-day scheduled soft delete) (US-PRIV-002).

**Auth:** Bearer JWT

**Response 200:**
```json
{
  "success": true,
  "scheduledFor": "2026-05-22T00:00:00Z",
  "message": "Your account will be permanently deleted on 2026-05-22. You may cancel within 30 days."
}
```

**Error responses:**
| Code | Error Code | Description |
|------|-----------|-------------|
| 409 | `deletion_already_pending` | Deletion request already exists |

---

#### DELETE `/api/v1/privacy/account/delete`

Cancel a pending deletion request (US-PRIV-002).

**Auth:** Bearer JWT

**Response 200:**
```json
{ "success": true, "deletionStatus": "active" }
```

**Error responses:**
| Code | Error Code | Description |
|------|-----------|-------------|
| 409 | `deletion_not_cancellable` | Deletion already executed or no pending request |

---

### §2.6 Game Endpoints

#### GET `/api/v1/game/jackpot`

Retrieve current jackpot pool amount (US-JACK-001).

**Auth:** Bearer JWT

**Response 200:**
```json
{
  "jackpotPool": 1500000,
  "currency": "gold"
}
```

---

#### GET `/api/v1/game/jackpot/odds`

Public endpoint — jackpot odds table for regulatory disclosure (US-JACK-002).

**Auth:** None (public)

**Response 200:**
```json
{
  "odds": [
    { "multiplier": 1,   "oddsDescription": "1 : 500,000" },
    { "multiplier": 10,  "oddsDescription": "1 : 50,000" },
    { "multiplier": 50,  "oddsDescription": "1 : 10,000" },
    { "multiplier": 100, "oddsDescription": "1 : 5,000" }
  ],
  "effectiveDate": "2026-04-22",
  "currency": "gold",
  "note": "Jackpot odds are for entertainment only. Odds may be updated; check this endpoint for current values."
}
```

---

### §2.7 Health Endpoints

#### GET `/health`

Kubernetes liveness probe. Always returns 200 if the process is running.

**Response 200:**
```json
{ "status": "ok" }
```

---

#### GET `/health/ready`

Kubernetes readiness probe. Returns 200 only after PostgreSQL and Redis connections are established.

**Response 200:**
```json
{ "status": "ready", "db": "connected", "redis": "connected" }
```

**Response 503** (during startup or dependency failure):
```json
{ "status": "not_ready", "db": "disconnected", "redis": "connected" }
```

---

## §3 Rate Limiting

Rate limiting implemented via `express-rate-limit` + Redis store.

| Endpoint Group | Limit | Window | Key | On Exceed |
|---------------|-------|--------|-----|-----------|
| Auth (`/auth/register`, `/auth/login`, `/auth/refresh`) | 10 req | 1 min | Per IP | 429 `rate_limited` |
| IAP verify (`/iap/verify`) | 5 req | 1 min | Per user (JWT sub) | 429 `rate_limited` |
| Profile update (`PATCH /user/profile`) | 20 req | 1 min | Per user | 429 `rate_limited` |
| All other JWT endpoints | 100 req | 1 min | Per user | 429 `rate_limited` |

**WebSocket message rate limits** (enforced in GameRoom Handler, not at HTTP layer):

| Message Type | Limit | Window | On Exceed |
|-------------|-------|--------|-----------|
| `shoot` | 10 active bullets | concurrent | Silently drop + WARN log |
| `set_multiplier` | 10 msg | per second per client | Silently drop + WARN log |
| `start_game` | 1 msg | per second per client | Silently drop + WARN log |

---

## §4 Colyseus WebSocket Protocol

### §4.1 Connection

```
WebSocket URL: wss://game.example.com/
Colyseus SDK: client.joinOrCreate('game_room', { token, nickname })
```

The Nginx Ingress upgrades HTTP to WebSocket and maintains the connection with `proxy-read-timeout: 3600` and `proxy-send-timeout: 3600`. Sticky session cookie `colyseus-affinity` ensures the client always reconnects to the same pod.

### §4.2 Client → Server Messages

#### `shoot`

Fire a bullet at a fish. Rate-limited to 10 active bullets per player.

```typescript
interface ShootMessage {
  bulletId: string;          // client-generated UUID for dedup (crypto.randomUUID())
  fishId: string;            // target fish ID from FishState.fishId
  betAmount: number;         // gold coins to wager (must be <= player.gold)
  cannonMultiplier: number;  // current cannon multiplier (1 | 10 | 50 | 100)
}
```

**Server validation:**
1. `bulletId` not in player's active-bullet Set (dedup)
2. Active-bullet Set size < 10 (rate limit)
3. `player.gold >= betAmount`
4. `fishId` exists and `alive == true` in `state.fish`

**Invalid message handling**: Silently dropped with WARN log. Server never throws on invalid shoot (Colyseus throws disconnect the client on unhandled errors).

---

#### `set_multiplier`

Change the player's cannon multiplier. Rate-limited to 10/s per client.

```typescript
interface SetMultiplierMessage {
  multiplier: number;  // 1 | 10 | 50 | 100
}
```

**Server validation**: `multiplier` must be one of the valid values. Invalid values silently dropped.

---

#### `start_game`

Signal readiness to start (used when room is in WAITING state). Rate-limited to 1/s per client.

```typescript
interface StartGameMessage {
  // No payload required
}
```

---

### §4.3 Server → Client Messages

#### `shoot_result`

Sent to the **shooter client only** after adjudication completes.

```typescript
interface ShootResultMessage {
  bulletId: string;   // echoes client's bulletId for correlation
  hit: boolean;       // true = fish was hit
  payout: number;     // gold credited (0 if miss or fish not killed)
  fishId: string;     // target fish
}
```

---

#### `jackpot_won`

**Broadcast to all room clients** when a jackpot is triggered.

```typescript
interface JackpotWonMessage {
  winnerId: string;  // verified user UUID (from client.auth — NOT sessionId)
  amount: number;    // gold amount won from pool
}
```

Client `NetworkManager._handleJackpotWon()` plays celebration animation. All room clients receive this message regardless of who won.

---

#### `boss_escaped`

**Broadcast to all room clients** when boss fish escape timer expires (60 s without kill).

```typescript
interface BossEscapedMessage {
  fishId: string;  // the boss fish that escaped
}
```

No gold refund for bets placed during boss fight. Boss is removed from `state.fish` before this broadcast.

---

### §4.4 Implicit State Sync (Schema Delta)

The following state changes are delivered automatically via Colyseus Schema v2 delta encoding — no separate message needed:

| State Change | Delivery Mechanism |
|-------------|-------------------|
| Fish spawned | `state.fish.onAdd((fish, key) => ...)` |
| Fish killed / removed | `state.fish.onRemove((fish, key) => ...)` |
| Fish HP decremented | Schema delta patch (FishState.hp change) |
| Player gold updated | `player.listen('gold', cb)` |
| Player nickname changed | `player.listen('nickname', cb)` |
| Jackpot pool amount | `state.listen('jackpotPool', cb)` |
| Room state transition | `state.listen('roomState', cb)` |
| Player connect/disconnect | `player.listen('isConnected', cb)` |

**Important**: Colyseus Schema v2 uses `state.listen('fieldName', cb)` for primitive field listeners, **not** `state.onChange('fieldName', cb)`. MapSchema uses `.onAdd` + per-item `.listen()`, **not** `.onChange`.

---

## §5 Colyseus Schema State Sync

### §5.1 GameState (root)

| Field | Type | Description |
|-------|------|-------------|
| `roomState` | `string` | `'WAITING'` \| `'PLAYING'` \| `'BOSS_BATTLE'` \| `'ENDED'` |
| `players` | `MapSchema<PlayerState>` | Keyed by Colyseus `sessionId` |
| `fish` | `MapSchema<FishState>` | Keyed by `fishId` |
| `bullets` | `MapSchema<BulletState>` | Keyed by `bulletId` |
| `jackpotPool` | `int64` | Current pool in gold coins (mirrored from Redis) |
| `activeBossHp` | `int32` | Current boss HP (0 when no active boss) |
| `activeBossMaxHp` | `int32` | Max HP of active boss (for HP-bar rendering) |
| `roomId` | `string` | Colyseus room identifier |
| `playerCount` | `int32` | Current connected player count |
| `rtpNumerator` | `int32` | Current effective RTP % × 100 (e.g., 92 = 92%); updated every tick |

### §5.2 PlayerState

| Field | Type | Description |
|-------|------|-------------|
| `playerId` | `string` | Colyseus `sessionId` |
| `nickname` | `string` | Display name (≤ 50 chars) |
| `gold` | `int64` | Current gold balance |
| `multiplier` | `int32` | Current cannon multiplier (1–100) |
| `isConnected` | `boolean` | Live connection status; false during reconnect window |
| `slotIndex` | `int32` | Seat index: 0=BL, 1=BR, 2=TL, 3=TR |

### §5.3 FishState

| Field | Type | Description |
|-------|------|-------------|
| `fishId` | `string` | Unique fish instance ID |
| `fishType` | `string` | `'normal'` \| `'elite'` \| `'boss'` |
| `hp` | `int32` | Current HP (decremented on hit) |
| `maxHp` | `int32` | Initial HP (1 for normal, 3–8 for elite, 50–200 for boss) |
| `posX` | `float32` | Current X position (used for initial placement; client interpolates along Bezier) |
| `posY` | `float32` | Current Y position |
| `rewardMultiplier` | `int32` | Payout = betAmount × baseMultiplier × rewardMultiplier |
| `alive` | `boolean` | False after HP reaches 0 (fish removed from state immediately after) |
| `pathData` | `string` | JSON-encoded Bezier control points: `[{x,y},{x,y},{x,y}]` (3–4 points). All clients reconstruct the identical deterministic path from this server-provided data. |
| `speed` | `float32` | Path traversal speed (units/s) |

### §5.4 BulletState

| Field | Type | Description |
|-------|------|-------------|
| `bulletId` | `string` | Client-generated UUID |
| `ownerId` | `string` | Colyseus `sessionId` of shooter |
| `originX` | `float32` | Cannon muzzle X |
| `originY` | `float32` | Cannon muzzle Y |
| `targetX` | `float32` | Aim target X |
| `targetY` | `float32` | Aim target Y |
| `multiplier` | `int32` | Cannon multiplier at fire time |

**Note**: Bullet events are sent as targeted one-off messages (not tracked in state schema long-term) to avoid per-bullet schema overhead. `BulletState` is added to the map at fire time and removed after `shoot_result` is sent.

---

## §6 Auth Flow Detail

```
┌──────────────────────────────────────────────────────────────────────┐
│  JWT RS256 Auth Flow                                                  │
│                                                                       │
│  1. Client → POST /api/v1/auth/login                                 │
│     Server → { accessToken (15 min), refreshToken (30 day) }         │
│                                                                       │
│  2. Client stores:                                                    │
│     • accessToken: in-memory only                                     │
│     • refreshToken: SecureStorage (iOS Keychain / Android Keystore)  │
│                                                                       │
│  3. Client → Colyseus joinOrCreate('game_room', { token: accessToken })│
│     Server → onAuth: verifyJwt(token) — RS256 public key verification│
│     Server → returns payload { userId, role } → client.auth          │
│                                                                       │
│  4. On 401 (token expired during REST call):                         │
│     Client → POST /api/v1/auth/refresh { refreshToken }              │
│     Server → new { accessToken, refreshToken } (old refresh invalidated)│
│     Client → retry original request with new accessToken             │
│                                                                       │
│  5. On WebSocket reconnect (within 10 s window):                     │
│     Client → client.reconnect(reconnectionToken)                      │
│     If reconnectionToken expired: re-login flow                       │
│                                                                       │
│  Security constraints:                                                │
│  • JWT claims: { sub: userId, role: 'player' } — no PII             │
│  • CORS: allowlist app bundle ID only (no wildcard)                  │
│  • RBAC: 'player' role for game endpoints; 'admin' for ops           │
│  • iOS: kSecAttrAccessibleWhenUnlockedThisDeviceOnly (no iCloud backup)│
│  • Android: hardware-backed Keystore (API 23+)                       │
└──────────────────────────────────────────────────────────────────────┘
```
