import { Schema, type } from '@colyseus/schema';

/**
 * Colyseus Schema v2 — PlayerState.
 *
 * Represents a single connected player within a GameRoom.
 * Serialised as part of GameState.players (MapSchema<PlayerState>).
 *
 * @type decorators from @colyseus/schema v2 (NOT v1 annotations).
 */
export class PlayerState extends Schema {
  /** Colyseus session ID — used as the MapSchema key in GameState.players */
  @type('string')
  playerId: string = '';

  /** Display name (max 50 chars; validated in GameRoom.onJoin) */
  @type('string')
  nickname: string = '';

  /**
   * Current gold balance mirrored from PostgreSQL.
   * Updated by WalletService after each debit/credit.
   * int64 to match BIGINT column in user_wallets.
   */
  @type('int64')
  gold: number = 0;

  /**
   * Active cannon multiplier (1–100).
   * Updated via set_multiplier message (rate-limited to 10/s).
   */
  @type('int32')
  multiplier: number = 1;

  /**
   * Whether the player is currently connected.
   * Set to false in onLeave; reverts to true if reconnection succeeds within 10s.
   */
  @type('boolean')
  isConnected: boolean = true;

  /**
   * Slot assignment: 0=P1(BL), 1=P2(BR), 2=P3(TL), 3=P4(TR).
   * Phase 1 cap: 4 players (slots 0–3). Phase 2 will extend to 5–5.
   */
  @type('int32')
  slotIndex: number = 0;
}
