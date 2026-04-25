import crypto from 'crypto';
import { FishState } from '../schema/FishState';
import { MapSchema } from '@colyseus/schema';

export interface BezierPoint { x: number; y: number }

export type SpawnCallback   = (fish: FishState) => void;
export type DespawnCallback = (fishId: string, escaped: boolean) => void;

interface SpawnerConfig {
  maxNormal:       number;
  normalIntervalMs: number;
  bossIntervalMs:  number;
  eliteThreshold:  number; // spawn elite when alive normals <= this value
  screenW:         number;
  screenH:         number;
}

const DEFAULT_CONFIG: SpawnerConfig = {
  maxNormal:        15,
  normalIntervalMs: 1_500,
  bossIntervalMs:   60_000,
  eliteThreshold:   2,   // spawn elite when ≤ 2 normal fish remain
  screenW:          1280,
  screenH:           720,
};

// ---------------------------------------------------------------------------
// FishSpawner
// ---------------------------------------------------------------------------

export class FishSpawner {
  private _cfg:        SpawnerConfig;
  private _fishMap:    MapSchema<FishState>;
  private _onSpawn:    SpawnCallback;
  private _onDespawn:  DespawnCallback;

  private _normalTimer: ReturnType<typeof setInterval> | null = null;
  private _bossTimer:   ReturnType<typeof setInterval> | null = null;
  private _disposed     = false;

  // Only bossActive needs explicit tracking — boss is managed externally via bossKilled()
  private _bossActive = false;

  constructor(
    fishMap:   MapSchema<FishState>,
    onSpawn:   SpawnCallback,
    onDespawn: DespawnCallback,
    config:    Partial<SpawnerConfig> = {},
  ) {
    this._cfg       = { ...DEFAULT_CONFIG, ...config };
    this._fishMap   = fishMap;
    this._onSpawn   = onSpawn;
    this._onDespawn = onDespawn;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  start(): void {
    // Initial fill: spread fish across the full path so screen is populated immediately.
    this._refillNormal(true);
    // Pre-age 1 elite so players have an immediate high-value target.
    this._spawnElite(5_000 + Math.random() * 15_000);

    // Safety-net top-up (primary fill happens in tick + _removeFish)
    this._normalTimer = setInterval(() => {
      if (!this._disposed) this._refillNormal();
    }, this._cfg.normalIntervalMs);

    this._bossTimer = setInterval(() => {
      if (!this._disposed && !this._bossActive) this._spawnBoss();
    }, this._cfg.bossIntervalMs);
  }

  /**
   * Called every game tick (50 ms). Removes escaped fish and triggers elite spawn.
   */
  tick(): void {
    if (this._disposed) return;
    const now = Date.now();
    const escaped: string[] = [];

    this._fishMap.forEach((fish, id) => {
      if (!fish.alive) return;
      if (now - fish.startTimeMs >= fish.durationMs) escaped.push(id);
    });

    for (const id of escaped) this._removeFish(id, true);

    // Always maintain normal fish floor
    this._refillNormal();

    // Threshold trigger: when normals run low and no elite is on screen, spawn one.
    // This creates the game loop: normals → low count → elite → killed → normals refill → repeat.
    if (!this._bossActive) {
      const aliveNormal = this._countAlive('normal');
      const aliveElite  = this._countAlive('elite');
      if (aliveNormal <= this._cfg.eliteThreshold && aliveElite === 0) {
        this._spawnElite();
      }
    }
  }

  dispose(): void {
    this._disposed = true;
    if (this._normalTimer) clearInterval(this._normalTimer);
    if (this._bossTimer)   clearInterval(this._bossTimer);
  }

  /** Called by GameRoom when a boss was killed by a player (not escaped). */
  bossKilled(fishId: string): void {
    this._bossActive = false;
    this._fishMap.delete(fishId);
    // Refill normals after boss clears the screen
    this._refillNormal();
  }

  // ---------------------------------------------------------------------------
  // Live count — counts directly from _fishMap to stay in sync with external kills
  // ---------------------------------------------------------------------------

  private _countAlive(type: 'normal' | 'elite' | 'boss'): number {
    let n = 0;
    this._fishMap.forEach(f => { if (f.alive && f.fishType === type) n++; });
    return n;
  }

  // ---------------------------------------------------------------------------
  // Spawn helpers
  // ---------------------------------------------------------------------------

  private _spawnNormal(preAgeMs = 0): void {
    const duration = 22_000 + Math.random() * 13_000; // 22-35s
    const speed    = 180   + Math.random() * 80;
    const fish     = this._create('normal', 1, 1, speed, duration, preAgeMs);
    this._fishMap.set(fish.fishId, fish);
    this._onSpawn(fish);
  }

  private _spawnElite(preAgeMs = 0): void {
    const duration = 30_000 + Math.random() * 20_000; // 30-50s
    const speed    = 140    + Math.random() * 60;
    const reward   = 2 + Math.floor(Math.random() * 4); // 2-5×
    const fish     = this._create('elite', 1, reward, speed, duration, preAgeMs);
    this._fishMap.set(fish.fishId, fish);
    this._onSpawn(fish);
  }

  private _spawnBoss(): void {
    const hp   = 10 + Math.floor(Math.random() * 11); // 10-20 HP
    const fish = this._create('boss', hp, 20, 80, 60_000);
    this._bossActive = true;
    this._fishMap.set(fish.fishId, fish);
    this._onSpawn(fish);
  }

  private _create(
    type:     'normal' | 'elite' | 'boss',
    hp:       number,
    reward:   number,
    speed:    number,
    duration: number,
    preAgeMs  = 0,
  ): FishState {
    const fish            = new FishState();
    fish.fishId           = crypto.randomUUID();
    fish.fishType         = type;
    fish.hp               = hp;
    fish.maxHp            = hp;
    fish.alive            = true;
    fish.rewardMultiplier = reward;
    fish.speed            = speed;
    // Clamp preAge to 80% of duration so fish never arrive already-expired
    fish.startTimeMs      = Date.now() - Math.min(preAgeMs, duration * 0.80);
    fish.durationMs       = duration;

    const path    = this._genPath(type);
    fish.pathData = JSON.stringify(path);
    fish.posX     = path[0].x;
    fish.posY     = path[0].y;

    return fish;
  }

  // ---------------------------------------------------------------------------
  // Path generation — cubic Bezier (4 control points)
  // ---------------------------------------------------------------------------

  private _genPath(type: 'normal' | 'elite' | 'boss'): BezierPoint[] {
    const hw = this._cfg.screenW / 2;
    const hh = this._cfg.screenH / 2;
    const MARGIN = 80;

    const sides: Array<'left' | 'right' | 'top' | 'bottom'> = ['left', 'right', 'top', 'bottom'];
    const entrySide = sides[Math.floor(Math.random() * 4)];
    const exits     = sides.filter(s => s !== entrySide);
    const exitSide  = exits[Math.floor(Math.random() * 3)];

    const edgePt = (side: string): BezierPoint => {
      switch (side) {
        case 'left':   return { x: -hw - MARGIN, y: rng(-hh * 0.8,  hh * 0.8) };
        case 'right':  return { x:  hw + MARGIN, y: rng(-hh * 0.8,  hh * 0.8) };
        case 'top':    return { x: rng(-hw * 0.8, hw * 0.8), y:  hh + MARGIN };
        case 'bottom': return { x: rng(-hw * 0.8, hw * 0.8), y: -hh - MARGIN };
        default:       return { x: 0, y: 0 };
      }
    };

    const p0 = edgePt(entrySide);
    const p3 = edgePt(exitSide);

    const p1: BezierPoint = {
      x: p0.x * 0.25 + rng(-hw * 0.7, hw * 0.7),
      y: p0.y * 0.25 + rng(-hh * 0.7, hh * 0.7),
    };
    const p2: BezierPoint = {
      x: p3.x * 0.25 + rng(-hw * 0.7, hw * 0.7),
      y: p3.y * 0.25 + rng(-hh * 0.7, hh * 0.7),
    };

    return [p0, p1, p2, p3];
  }

  // ---------------------------------------------------------------------------
  // Internal remove (escaped fish only — killed fish are removed by GameRoom)
  // ---------------------------------------------------------------------------

  private _refillNormal(initialFill = false): void {
    while (!this._disposed && this._countAlive('normal') < this._cfg.maxNormal) {
      const preAge = initialFill
        ? Math.random() * 22_000          // 0–22s: spread across full path on startup
        : 3_000 + Math.random() * 7_000;  // 3–10s: enters visible area quickly
      this._spawnNormal(preAge);
    }
  }

  private _removeFish(fishId: string, escaped: boolean): void {
    const fish = this._fishMap.get(fishId);
    if (!fish) return;

    if (fish.fishType === 'boss') this._bossActive = false;

    this._fishMap.delete(fishId);
    this._onDespawn(fishId, escaped);

    this._refillNormal();
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function rng(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
