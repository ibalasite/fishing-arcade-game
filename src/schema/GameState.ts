import { Schema, type, MapSchema } from '@colyseus/schema';
import { PlayerState } from './PlayerState';
import { FishState } from './FishState';

// ---------------------------------------------------------------------------
// BulletState — inline here since it's small and part of the same schema layer
// ---------------------------------------------------------------------------

/**
 * Colyseus Schema v2 — BulletState.
 *
 * Bullets are broadcast as state schema entries so all clients can render
 * active bullets from all players. Bullet travel is client-predicted; only
 * hit/miss outcome is authoritative from the server.
 */
export class BulletState extends Schema {
  @type('string')
  bulletId: string = '';

  /** Colyseus session ID of the firing player */
  @type('string')
  ownerId: string = '';

  @type('float32')
  originX: number = 0;

  @type('float32')
  originY: number = 0;

  @type('float32')
  targetX: number = 0;

  @type('float32')
  targetY: number = 0;

  /** Cannon multiplier at fire time (for client-side visual scaling) */
  @type('int32')
  multiplier: number = 1;
}

// ---------------------------------------------------------------------------
// GameState — root schema for the room
// ---------------------------------------------------------------------------

/**
 * Colyseus Schema v2 — GameState (root).
 *
 * This is the top-level schema passed to `this.setState()` in GameRoom.onCreate.
 * Colyseus delta-encodes all field changes and broadcasts patches to clients at 20Hz.
 *
 * Room state lifecycle: WAITING → PLAYING → JACKPOT | BOSS_FIGHT → PLAYING → ENDED
 */
export class GameState extends Schema {
  /**
   * Room lifecycle state.
   * Valid values: 'WAITING' | 'PLAYING' | 'JACKPOT' | 'BOSS_FIGHT' | 'ENDED'
   */
  @type('string')
  roomState: string = 'WAITING';

  /** Active players, keyed by Colyseus sessionId */
  @type({ map: PlayerState })
  players = new MapSchema<PlayerState>();

  /** Active fish, keyed by fishId */
  @type({ map: FishState })
  fish = new MapSchema<FishState>();

  /** Active bullets, keyed by bulletId */
  @type({ map: BulletState })
  bullets = new MapSchema<BulletState>();

  /**
   * Current jackpot pool (gold coins), mirrored from Redis on each state patch.
   * int64 to handle large pools without truncation.
   */
  @type('int64')
  jackpotPool: number = 0;

  /** Active boss HP — 0 when no boss is present */
  @type('int32')
  activeBossHp: number = 0;

  /** Active boss max HP — 0 when no boss is present; used for client health bar */
  @type('int32')
  activeBossMaxHp: number = 0;

  /** Colyseus room ID (set in onCreate) */
  @type('string')
  roomId: string = '';

  /** Number of currently connected players */
  @type('int32')
  playerCount: number = 0;

  /**
   * Current effective RTP percentage as an integer (e.g. 94 = 94%).
   * Refreshed each tick: Math.round(rtpEngine.currentRtp * 100).
   * Used by the client HUD to display the current RTP indicator.
   */
  @type('int32')
  rtpNumerator: number = 92;
}

export { PlayerState, FishState };
