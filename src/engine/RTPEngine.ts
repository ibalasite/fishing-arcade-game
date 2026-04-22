import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

/** Shared fish type — also imported by FishSpawner and schema files */
export type FishType = 'normal' | 'elite' | 'boss';

export interface HitResult {
  hit: boolean;
  payout: number;
}

export interface JackpotResult {
  winnerId: string;
  amount: number;
}

export interface FishConfig {
  fishType: FishType;
  /** Payout multiplier: payout = betAmount × baseMultiplier × cannonMultiplier */
  baseMultiplier: number;
  /** Integer numerator: hit probability = hitRateNumerator / hitRateDenominator */
  hitRateNumerator: number;
  /** Fixed denominator, e.g. 100_000. Must be consistent across all FishConfigs. */
  hitRateDenominator: number;
}

export interface RTPConfig {
  /** Minimum acceptable RTP, e.g. 0.92 (92%). BRD §0.1 specifies 92–96% overall RTP. */
  targetRtpMin: number;
  /** Maximum acceptable RTP, e.g. 0.96 (96%). */
  targetRtpMax: number;
  fishConfigs: FishConfig[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Minimum cumulative bet amount before dynamic hit-rate adjustment activates.
 * Prevents wild swings at room startup when sample size is tiny.
 * Value: 200 bets × MIN_BET_AMOUNT = 200 gold minimum sample.
 */
const MIN_SAMPLE_BETS = 200;

/**
 * Minimum coin bet amount. Used to calculate the sample threshold:
 * dynamic adjustment activates once totalBet >= MIN_SAMPLE_BETS * MIN_BET_AMOUNT.
 */
const MIN_BET_AMOUNT = 1;

// ---------------------------------------------------------------------------
// RTPEngine
// ---------------------------------------------------------------------------

/**
 * Server-authoritative RTP (Return To Player) engine.
 *
 * All hit adjudication executes here using integer-denominator RNG to prevent
 * floating-point drift (PRD BRD §0.1 technical risk R2, US-RTP-001/AC-3).
 *
 * Uses BigInt for totalBet / totalPaid accumulators to avoid float overflow
 * over the lifetime of a high-volume room.
 *
 * Thread safety: Node.js is single-threaded; no locking required.
 */
export class RTPEngine {
  /** Cumulative gold bet across all adjudications in this room. BigInt prevents overflow. */
  private _totalBet = 0n;

  /** Cumulative gold paid out (hits + external jackpot payouts). BigInt prevents overflow. */
  private _totalPaid = 0n;

  private _config: RTPConfig;

  constructor(config: RTPConfig) {
    // Validate fish configs at construction time to catch mis-configuration early.
    for (const fc of config.fishConfigs) {
      if (!Number.isInteger(fc.hitRateDenominator) || fc.hitRateDenominator <= 0) {
        throw new Error(
          `RTPEngine: fishType "${fc.fishType}" has invalid hitRateDenominator (${fc.hitRateDenominator}). Must be a positive integer.`,
        );
      }
      if (!Number.isInteger(fc.hitRateNumerator) || fc.hitRateNumerator < 0) {
        throw new Error(
          `RTPEngine: fishType "${fc.fishType}" has invalid hitRateNumerator (${fc.hitRateNumerator}). Must be a non-negative integer.`,
        );
      }
      if (fc.hitRateNumerator > fc.hitRateDenominator) {
        throw new Error(
          `RTPEngine: fishType "${fc.fishType}" hitRateNumerator (${fc.hitRateNumerator}) exceeds hitRateDenominator (${fc.hitRateDenominator}). Hit probability cannot exceed 100%.`,
        );
      }
    }
    this._config = config;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Registers an external payout (e.g. jackpot) so it is counted in RTP accounting.
   * Must be called after every jackpot win to ensure the RTP meter reflects total
   * money-out including jackpots (US-RTP-001/AC-1).
   */
  addExternalPayout(amount: number): void {
    this._totalPaid += BigInt(amount);
  }

  /**
   * Server-authoritative hit adjudication.
   *
   * Workflow:
   * 1. Look up FishConfig for the given fishType.
   * 2. Apply dynamic hit-rate adjustment (if enough samples accumulated).
   * 3. Roll crypto.randomInt(denominator) — CSPRNG, no floating-point bias.
   * 4. Hit if roll < adjustedNumerator.
   * 5. Update totalBet and totalPaid accumulators.
   * 6. Return HitResult with hit flag and payout amount.
   *
   * @param fishType   Type of the target fish.
   * @param betAmount  Gold coins wagered for this shot.
   * @param multiplier Cannon multiplier (1–100). Scales payout but NOT hit probability.
   */
  adjudicate(fishType: FishType, betAmount: number, multiplier: number): HitResult {
    const fishCfg = this._config.fishConfigs.find(f => f.fishType === fishType);
    if (!fishCfg) {
      throw new Error(`Unknown fishType: ${fishType}`);
    }

    // Dynamic hit-rate adjustment — suppressed until MIN_SAMPLE_BETS reached
    const adjustedNumerator = this._dynamicAdjust(fishCfg);

    // CSPRNG: crypto.randomInt(max) returns uniform integer in [0, max)
    const roll = crypto.randomInt(fishCfg.hitRateDenominator);
    const hit = roll < adjustedNumerator;

    this._totalBet += BigInt(betAmount);
    if (hit) {
      const payout = betAmount * fishCfg.baseMultiplier * multiplier;
      this._totalPaid += BigInt(payout);
      return { hit: true, payout };
    }
    return { hit: false, payout: 0 };
  }

  /**
   * Current RTP with basis-point precision (0.01% granularity).
   *
   * Formula: totalPaid × 10000 / totalBet  (integer arithmetic), then / 10000.
   * This avoids floating-point drift on very large accumulators.
   *
   * Returns targetRtpMin when no bets have been placed (avoids division by zero).
   */
  get currentRtp(): number {
    if (this._totalBet === 0n) return this._config.targetRtpMin;
    // BigInt integer division preserves precision to 4 decimal places (basis points).
    return Number(this._totalPaid * 10_000n / this._totalBet) / 10_000;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Dynamically adjusts the hit-rate numerator to steer actual RTP toward [targetRtpMin, targetRtpMax].
   *
   * Suppressed until totalBet >= MIN_SAMPLE_BETS × MIN_BET_AMOUNT to avoid extreme
   * hit-rate swings at room startup when sample size is too small to be meaningful.
   *
   * - If RTP > targetRtpMax → scale numerator DOWN (reduce hit frequency).
   * - If RTP < targetRtpMin → scale numerator UP (increase hit frequency).
   * - Within range → return base numerator unchanged.
   *
   * The UP-scale is capped at (denominator - 1) to prevent 100% hit rate.
   */
  private _dynamicAdjust(cfg: FishConfig): number {
    const sampleThreshold = BigInt(MIN_SAMPLE_BETS * MIN_BET_AMOUNT);
    if (this._totalBet < sampleThreshold) {
      return cfg.hitRateNumerator;
    }

    const rtp = this.currentRtp;

    if (rtp > this._config.targetRtpMax) {
      // Overpaying — scale down to dampen hit rate
      const scale = this._config.targetRtpMax / rtp;
      return Math.floor(cfg.hitRateNumerator * scale);
    }

    if (rtp < this._config.targetRtpMin) {
      // Underpaying — scale up to boost hit rate.
      // Guard: if rtp === 0, the scale factor is Infinity.
      // 0 * Infinity = NaN in IEEE 754, so we guard explicitly:
      // - If base numerator is 0 (fish configured as unkillable), keep it 0.
      // - Otherwise cap at denominator - 1 (max hit rate without 100%).
      if (rtp === 0) {
        return cfg.hitRateNumerator === 0 ? 0 : cfg.hitRateDenominator - 1;
      }
      const scale = this._config.targetRtpMin / rtp;
      return Math.min(
        Math.floor(cfg.hitRateNumerator * scale),
        cfg.hitRateDenominator - 1,
      );
    }

    return cfg.hitRateNumerator;
  }
}
