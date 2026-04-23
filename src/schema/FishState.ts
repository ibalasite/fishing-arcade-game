import { Schema, type } from '@colyseus/schema';

/**
 * Colyseus Schema v2 — FishState.
 *
 * Represents a single active fish within the game world.
 * Serialised as part of GameState.fish (MapSchema<FishState>).
 *
 * Bezier path is server-computed (deterministic per fishId) so all clients
 * reconstruct the identical path without additional synchronisation.
 */
export class FishState extends Schema {
  /** Server-assigned unique fish ID (UUID or incrementing room-local counter) */
  @type('string')
  fishId: string = '';

  /** Fish category: 'normal' | 'elite' | 'boss' */
  @type('string')
  fishType: string = '';

  /** Current HP. Decremented server-side on each bullet hit. */
  @type('int32')
  hp: number = 1;

  /** Max HP (set on spawn; used by clients for health-bar rendering). */
  @type('int32')
  maxHp: number = 1;

  /**
   * Current position X (world space, left=0).
   * Updated each server tick for the primary client to interpolate against.
   */
  @type('float32')
  posX: number = 0;

  /**
   * Current position Y (world space, top=0).
   */
  @type('float32')
  posY: number = 0;

  /**
   * Payout multiplier for this specific fish instance.
   * Payout = betAmount × baseMultiplier × cannonMultiplier × rewardMultiplier.
   */
  @type('int32')
  rewardMultiplier: number = 1;

  /** Whether the fish is alive (false = killed, pending removal from schema) */
  @type('boolean')
  alive: boolean = true;

  /**
   * JSON-encoded Bezier path: [{x,y},{x,y},{x,y}] (3–4 control points).
   * All clients reconstruct the identical deterministic path from this data.
   * Set once on spawn; never updated during fish lifetime.
   */
  @type('string')
  pathData: string = '';

  /** Fish movement speed along the Bezier path (world units per second). */
  @type('float32')
  speed: number = 1.0;

  /** Unix timestamp (ms) when this fish was spawned. Clients use this for Bezier interpolation. */
  @type('float64')
  startTimeMs: number = 0;

  /** Total path duration in ms. When elapsed >= durationMs the server removes the fish. */
  @type('float64')
  durationMs: number = 10000;
}
