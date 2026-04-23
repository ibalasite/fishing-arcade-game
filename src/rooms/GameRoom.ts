/**
 * GameRoom — Colyseus 0.15 server-authoritative fishing arcade game room.
 *
 * Phase 1 cap: 4 players (BRD §4 specifies 4-6; Phase 2 will raise to 6).
 *
 * Key design constraints:
 * - ALL game outcome calculations run server-side (RTP, bullet-hit adjudication, jackpot)
 * - Client is display-only (PRD §7.4 anti-cheat)
 * - 20Hz state tick (50ms) via setInterval
 * - Dispose guard: _tick() checks _disposed before any state mutation
 */

import http from 'http';
import { Room, Client } from '@colyseus/core';
import { GameState, PlayerState, BulletState } from '../schema/GameState';
import { RTPEngine, RTPConfig } from '../engine/RTPEngine';
import { FishSpawner } from '../engine/FishSpawner';
import { JackpotManager } from '../engine/JackpotManager';
import { WalletService } from '../services/WalletService';
import { db } from '../utils/db';
import { verifyJwt } from '../utils/auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JoinOptions {
  token: string;
  nickname?: string;
}

interface RoomCreateOptions {
  [key: string]: unknown;
}

interface JwtPayload {
  userId: string;
  [key: string]: unknown;
}

interface ShootMessage {
  bulletId: string;
  fishId: string;
  /**
   * Client-reported cannon multiplier — ignored by the server.
   * The server uses the authoritative player.multiplier (set via set_multiplier message)
   * for all game calculations to prevent anti-cheat exploits.
   * Kept in the interface for client backward compatibility.
   */
  cannonMultiplier?: number;
  betAmount: number;
  targetX?: number;
  targetY?: number;
}

interface SetMultiplierMessage {
  multiplier: number;
}

// ---------------------------------------------------------------------------
// Room-level constants
// ---------------------------------------------------------------------------

const RTP_CONFIG: RTPConfig = {
  targetRtpMin: 0.92,
  targetRtpMax: 0.96,
  fishConfigs: [
    { fishType: 'normal', baseMultiplier: 2, hitRateNumerator: 46_000, hitRateDenominator: 100_000 },
    { fishType: 'elite', baseMultiplier: 5, hitRateNumerator: 12_000, hitRateDenominator: 100_000 },
    { fishType: 'boss', baseMultiplier: 50, hitRateNumerator: 1_000, hitRateDenominator: 100_000 },
  ],
};

const TICK_INTERVAL_MS = 50;    // 20Hz
const RECONNECT_TIMEOUT_S = 10;
const MAX_ACTIVE_BULLETS = 10;  // per-client rate cap
const MAX_MULTIPLIER = 100;
const MIN_MULTIPLIER = 1;

// ---------------------------------------------------------------------------
// GameRoom
// ---------------------------------------------------------------------------

export class GameRoom extends Room<GameState> {
  maxClients = 4; // Phase 1 cap; Phase 2 will raise to 6

  private _rtpEngine!: RTPEngine;
  private _fishSpawner!: FishSpawner;
  private _jackpotManager!: JackpotManager;
  private _walletService!: WalletService;
  private _tickInterval!: ReturnType<typeof setInterval>;

  /**
   * Guard against post-dispose tick callbacks.
   * setInterval can fire once more in the same event-loop tick after clearInterval returns.
   */
  private _disposed = false;

  /** Per-player in-flight bullet set. Capped at MAX_ACTIVE_BULLETS (dedup + rate-limit). */
  private _activeBullets = new Map<string, Set<string>>();

  /** Boss escape timers: fishId → NodeJS.Timeout. Cleared in onDispose. */
  private _bossEscapeTimers = new Map<string, NodeJS.Timeout>();

  /** Per-client rate-limit counters: `${sessionId}:${type}` → { count, windowStart } */
  private _msgRateLimits = new Map<string, { count: number; windowStart: number }>();

  /** Slot occupancy — 4 slots (Phase 1) */
  private _occupiedSlots = new Set<number>();

  // ---------------------------------------------------------------------------
  // Colyseus lifecycle hooks
  // ---------------------------------------------------------------------------

  /**
   * Verify JWT before onJoin.
   * Called with request headers by Colyseus 0.15.
   * Returned value becomes client.auth.
   */
  async onAuth(
    _client: Client,
    options: JoinOptions,
    _request: http.IncomingMessage,
  ): Promise<JwtPayload> {
    const token = options.token;
    if (!token) throw new Error('missing_token');
    const payload = verifyJwt(token); // throws if invalid/expired
    return payload as JwtPayload;
  }

  async onCreate(_options: RoomCreateOptions): Promise<void> {
    this.setState(new GameState());
    this.state.roomId = this.roomId;

    this._rtpEngine = new RTPEngine(RTP_CONFIG);
    this._walletService = new WalletService(db);
    this._jackpotManager = await JackpotManager.getInstance();

    this._fishSpawner = new FishSpawner(
      this.state.fish,
      (fish) => {
        // Boss spawn → transition room state and set HP display
        if (fish.fishType === 'boss') {
          this.state.activeBossHp    = fish.hp;
          this.state.activeBossMaxHp = fish.maxHp;
          this.state.roomState = 'BOSS_FIGHT';
          this.broadcast('boss_spawned', { fishId: fish.fishId });
        }
      },
      (fishId, escaped) => {
        if (escaped) {
          this.broadcast('fish_escaped', { fishId });
          // If the escaped fish was a boss, reset room state
          if (this.state.activeBossHp > 0) {
            this.state.activeBossHp    = 0;
            this.state.activeBossMaxHp = 0;
            this.state.roomState = 'PLAYING';
          }
        }
      },
    );

    // Register message handlers in onCreate — do NOT override onMessage base method
    this.onMessage<ShootMessage>('shoot', this._handleShoot.bind(this));
    this.onMessage<SetMultiplierMessage>('set_multiplier', this._handleSetMultiplier.bind(this));
    this.onMessage<unknown>('start_game', this._handleStartGame.bind(this));

    // 20Hz state tick
    this._tickInterval = setInterval(() => this._tick(), TICK_INTERVAL_MS);

    // Record room creation for analytics
    await db.query(
      `INSERT INTO game_sessions(room_id, started_at, player_count, room_state, ip_address)
       VALUES($1, NOW(), 0, 'WAITING', NULL)`,
      [this.roomId],
    );
  }

  async onJoin(client: Client, options: JoinOptions): Promise<void> {
    const nickname = (options.nickname ?? '').slice(0, 50).trim();
    if (!nickname) throw new Error('invalid_nickname');

    const player = new PlayerState();
    player.playerId = client.sessionId;
    player.nickname = nickname;
    player.gold = await this._walletService.getGold((client.auth as JwtPayload).userId);
    player.slotIndex = this._assignSlot();
    player.isConnected = true;

    this.state.players.set(client.sessionId, player);
    this.state.playerCount = this.state.players.size;
    this._activeBullets.set(client.sessionId, new Set<string>());

    if (this.state.playerCount >= this.maxClients) {
      this._transitionToPlaying();
    }

    await db.query(
      `UPDATE game_sessions
       SET player_ids   = array_append(player_ids, $1::uuid),
           player_count = $2,
           room_state   = $3
       WHERE room_id = $4`,
      [(client.auth as JwtPayload).userId, this.state.playerCount, this.state.roomState, this.roomId],
    );
  }

  /**
   * Colyseus 0.15: second param is `consented` boolean (true = intentional disconnect).
   * When consented is false/undefined the client disconnected unexpectedly and
   * we allow a reconnection window.
   */
  async onLeave(client: Client, consented?: boolean): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (player) player.isConnected = false;

    // Cleanup per-client state immediately regardless of reconnection outcome
    this._activeBullets.delete(client.sessionId);
    this._msgRateLimits.forEach((_, key) => {
      if (key.startsWith(client.sessionId + ':')) this._msgRateLimits.delete(key);
    });

    if (!consented) {
      try {
        // Allow reconnection within 10s (PRD US-ROOM-001/AC-4)
        await this.allowReconnection(client, RECONNECT_TIMEOUT_S);
        if (player) {
          player.isConnected = true;
          this._activeBullets.set(client.sessionId, new Set<string>());
        }
      } catch {
        // Reconnection timed out — remove player
        this._removePlayer(client.sessionId);
      }
    } else {
      this._removePlayer(client.sessionId);
    }
  }

  // NOTE: Do NOT override onMessage(). Use this.onMessage(type, cb) in onCreate() only.

  async onDispose(): Promise<void> {
    this._disposed = true;
    clearInterval(this._tickInterval);
    this._fishSpawner.dispose();

    // Clear boss escape timers to prevent post-dispose callbacks
    this._bossEscapeTimers.forEach(t => clearTimeout(t));
    this._bossEscapeTimers.clear();

    await this._jackpotManager.persistPool();
    await this._walletService.flushBatch();

    await db.query(
      `UPDATE game_sessions SET ended_at = NOW(), player_count = $1, room_state = 'ENDED'
       WHERE room_id = $2 AND ended_at IS NULL`,
      [this.state.playerCount, this.roomId],
    );
  }

  // ---------------------------------------------------------------------------
  // Message handlers
  // ---------------------------------------------------------------------------

  _handleShoot(client: Client, data: ShootMessage): void {
    if (this._disposed) return;
    if (this.state.roomState !== 'PLAYING' && this.state.roomState !== 'BOSS_FIGHT') return;

    // 0a. Message-level rate limiting (prevents flooding with shoot messages)
    if (!this._checkRateLimit(client.sessionId, 'shoot', 20)) {
      // Silently drop — do not reveal rate-limit state to the client
      return;
    }

    const { bulletId, fishId, cannonMultiplier, betAmount } = data;

    // 0b. Bullet deduplication + active-bullet rate limiting (max MAX_ACTIVE_BULLETS per player)
    const bullets = this._activeBullets.get(client.sessionId) ?? new Set<string>();
    if (bullets.has(bulletId)) return; // duplicate — silently drop
    if (bullets.size >= MAX_ACTIVE_BULLETS) return; // in-flight cap
    bullets.add(bulletId);
    this._activeBullets.set(client.sessionId, bullets);

    // Run adjudication asynchronously to avoid blocking the event loop
    this._adjudicateShot(client, { bulletId, fishId, cannonMultiplier, betAmount }).catch(err => {
      console.error('adjudicate_shot_failed', { sessionId: client.sessionId, err });
    }).finally(() => {
      bullets.delete(bulletId);
    });
  }

  _handleSetMultiplier(client: Client, data: SetMultiplierMessage): void {
    if (!this._checkRateLimit(client.sessionId, 'set_multiplier', 10)) {
      console.warn(`rate_limit set_multiplier ${client.sessionId}`);
      return;
    }
    const multiplier = Number(data?.multiplier);
    if (!Number.isInteger(multiplier) || multiplier < MIN_MULTIPLIER || multiplier > MAX_MULTIPLIER) {
      return;
    }
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    player.multiplier = multiplier;
  }

  _handleStartGame(client: Client, _data: unknown): void {
    if (!this._checkRateLimit(client.sessionId, 'start_game', 1)) {
      console.warn(`rate_limit start_game ${client.sessionId}`);
      return;
    }
    if (this.state.roomState !== 'WAITING') return;
    this._transitionToPlaying();
  }

  // ---------------------------------------------------------------------------
  // Tick
  // ---------------------------------------------------------------------------

  private _tick(): void {
    if (this._disposed) return;
    if (this.state.roomState !== 'PLAYING' && this.state.roomState !== 'BOSS_FIGHT') return;

    // Advance fish spawner (removes escaped fish from schema)
    this._fishSpawner.tick();

    // Refresh RTP indicator on HUD
    this.state.rtpNumerator = Math.round(this._rtpEngine.currentRtp * 100);

    // Mirror jackpot pool into state (fire-and-forget; non-blocking)
    this._jackpotManager.getPool().then(amount => {
      if (!this._disposed) this.state.jackpotPool = amount;
    }).catch(() => { /* ignore redis errors in tick */ });
  }

  // ---------------------------------------------------------------------------
  // Rate limiting
  // ---------------------------------------------------------------------------

  _checkRateLimit(sessionId: string, type: string, maxPerSec: number): boolean {
    const key = `${sessionId}:${type}`;
    const now = Date.now();
    const entry = this._msgRateLimits.get(key) ?? { count: 0, windowStart: now };
    if (now - entry.windowStart > 1000) {
      entry.count = 0;
      entry.windowStart = now;
    }
    entry.count++;
    this._msgRateLimits.set(key, entry);
    return entry.count <= maxPerSec;
  }

  // ---------------------------------------------------------------------------
  // Boss fish management
  // ---------------------------------------------------------------------------

  _spawnBoss(bossState: import('../schema/FishState').FishState): void {
    this.state.fish.set(bossState.fishId, bossState);
    this.state.activeBossHp = bossState.hp;
    this.state.activeBossMaxHp = bossState.maxHp;
    this.state.roomState = 'BOSS_FIGHT';

    const timer = setTimeout(() => {
      if (this.state.fish.has(bossState.fishId)) {
        this.state.fish.delete(bossState.fishId);
        this.state.activeBossHp = 0;
        this.state.activeBossMaxHp = 0;
        this.state.roomState = 'PLAYING';
        this.broadcast('boss_escaped', { fishId: bossState.fishId });
      }
      this._bossEscapeTimers.delete(bossState.fishId);
    }, 60_000);

    this._bossEscapeTimers.set(bossState.fishId, timer);
  }

  _onBossKilled(fishId: string): void {
    const timer = this._bossEscapeTimers.get(fishId);
    if (timer) {
      clearTimeout(timer);
      this._bossEscapeTimers.delete(fishId);
    }
    this._fishSpawner.bossKilled(fishId);
    this.state.activeBossHp    = 0;
    this.state.activeBossMaxHp = 0;
    this.state.roomState = 'PLAYING';
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async _adjudicateShot(client: Client, data: ShootMessage): Promise<void> {
    const { bulletId, fishId, betAmount } = data;
    const sessionId = client.sessionId;
    const userId = (client.auth as JwtPayload).userId;

    const player = this.state.players.get(sessionId);
    if (!player) return;

    // Anti-cheat: use the server-authoritative multiplier (set via set_multiplier message
    // and stored in player.multiplier). Ignore the client-provided cannonMultiplier to
    // prevent clients from claiming higher multiplier (better jackpot odds / larger payout)
    // without paying the corresponding higher bet.
    const authorativeMultiplier = player.multiplier;

    // 1. Validate bet amount and balance
    if (!Number.isInteger(betAmount) || betAmount <= 0) {
      client.send('shoot_result', { bulletId, hit: false, payout: 0, error: 'invalid_bet' });
      return;
    }
    if (player.gold < betAmount) {
      client.send('shoot_result', { bulletId, hit: false, payout: 0, error: 'insufficient_gold' });
      return;
    }

    // 2. Validate fish exists and is alive
    const fish = this.state.fish.get(fishId);
    if (!fish || !fish.alive) {
      client.send('shoot_result', { bulletId, hit: false, payout: 0, error: 'fish_not_found' });
      return;
    }

    // 3. Debit bet amount (atomic, via WalletService)
    await this._walletService.debitGold(userId, betAmount);
    player.gold -= betAmount;

    // 4. RTP adjudication — use server-authoritative multiplier for payout scaling
    const fishType = fish.fishType as import('../engine/RTPEngine').FishType;
    const result = this._rtpEngine.adjudicate(fishType, betAmount, authorativeMultiplier);

    let payout = 0;

    if (result.hit) {
      // 5a. Decrement fish HP
      fish.hp -= 1;

      if (fish.hp <= 0) {
        fish.alive = false;
        payout = result.payout;

        // Credit payout
        await this._walletService.creditGold(userId, payout, 'earn');
        player.gold += payout;

        this.state.fish.delete(fishId);
        this.broadcast('fish_killed', { fishId, killerId: sessionId, payout });

        // Handle boss kill
        if (fish.fishType === 'boss') {
          this._onBossKilled(fishId);
        }
      }
    }

    // 6. Jackpot contribution + trigger check — use server-authoritative multiplier for odds
    await this._jackpotManager.contribute(betAmount);
    const jackpotResult = await this._jackpotManager.tryTrigger(authorativeMultiplier, userId);
    if (jackpotResult) {
      player.gold += jackpotResult.amount;
      this._rtpEngine.addExternalPayout(jackpotResult.amount);
      this.state.roomState = 'JACKPOT';
      this.broadcast('jackpot_won', { winnerId: userId, amount: jackpotResult.amount });
      // Return to playing after a brief display window
      setTimeout(() => {
        if (!this._disposed) this.state.roomState = 'PLAYING';
      }, 5_000);
    }

    // 7. Fire-and-forget RTP audit log (does NOT block response)
    // SCHEMA: rtp_logs has no session_id column; rtp_at_time is REQUIRED (NUMERIC 5,4)
    db.query(
      "INSERT INTO rtp_logs(room_id, user_id, fish_type, bet_amount, multiplier, hit, payout, rtp_at_time, created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW())",
      [this.roomId, userId, fishType, betAmount, authorativeMultiplier, result.hit, payout, this._rtpEngine.currentRtp],
    ).catch(err => console.error('rtp_log_write_failed', err));

    // 8. Send result to shooter
    client.send('shoot_result', { bulletId, hit: result.hit, payout });

    // Add bullet to state for brief visibility then remove.
    // _disposed guard prevents writing to state after room disposal.
    const bulletState = new BulletState();
    bulletState.bulletId = bulletId;
    bulletState.ownerId = sessionId;
    bulletState.multiplier = authorativeMultiplier;
    // Sanitise optional visual position fields — coerce to finite number (client display only)
    bulletState.targetX = Number.isFinite(data.targetX) ? (data.targetX as number) : 0;
    bulletState.targetY = Number.isFinite(data.targetY) ? (data.targetY as number) : 0;
    this.state.bullets.set(bulletId, bulletState);
    setTimeout(() => {
      if (!this._disposed) this.state.bullets.delete(bulletId);
    }, 500);
  }

  private _transitionToPlaying(): void {
    this.state.roomState = 'PLAYING';
    this._fishSpawner.start();
  }

  private _assignSlot(): number {
    for (let i = 0; i < this.maxClients; i++) {
      if (!this._occupiedSlots.has(i)) {
        this._occupiedSlots.add(i);
        return i;
      }
    }
    return this._occupiedSlots.size; // fallback (should not happen with maxClients guard)
  }

  private _removePlayer(sessionId: string): void {
    const player = this.state.players.get(sessionId);
    if (player) {
      this._occupiedSlots.delete(player.slotIndex);
    }
    this.state.players.delete(sessionId);
    this.state.playerCount = this.state.players.size;
  }
}
