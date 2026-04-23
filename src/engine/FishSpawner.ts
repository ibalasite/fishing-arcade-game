import crypto from 'crypto';
import { FishState } from '../schema/FishState';
import { MapSchema } from '@colyseus/schema';

export interface BezierPoint { x: number; y: number }

export type SpawnCallback   = (fish: FishState) => void;
export type DespawnCallback = (fishId: string, escaped: boolean) => void;

interface SpawnerConfig {
  maxNormal:          number;
  maxElite:           number;
  normalIntervalMs:   number;
  eliteIntervalMs:    number;
  bossIntervalMs:     number;
  eliteSpawnChance:   number;
  screenW:            number;
  screenH:            number;
}

const DEFAULT_CONFIG: SpawnerConfig = {
  maxNormal:        15,
  maxElite:          3,
  normalIntervalMs: 2_000,
  eliteIntervalMs:  30_000,
  bossIntervalMs:   180_000,
  eliteSpawnChance:  0.35,
  screenW:          1280,
  screenH:           720,
};

// ---------------------------------------------------------------------------
// FishSpawner
// ---------------------------------------------------------------------------

export class FishSpawner {
  private _cfg:         SpawnerConfig;
  private _fishMap:     MapSchema<FishState>;
  private _onSpawn:     SpawnCallback;
  private _onDespawn:   DespawnCallback;

  private _normalTimer: ReturnType<typeof setInterval> | null = null;
  private _eliteTimer:  ReturnType<typeof setInterval> | null = null;
  private _bossTimer:   ReturnType<typeof setInterval> | null = null;
  private _disposed     = false;

  private _normalCount  = 0;
  private _eliteCount   = 0;
  private _bossActive   = false;

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
    // Seed with a small initial wave
    for (let i = 0; i < 5; i++) this._spawnNormal();

    this._normalTimer = setInterval(() => {
      if (!this._disposed && this._normalCount < this._cfg.maxNormal) {
        this._spawnNormal();
      }
    }, this._cfg.normalIntervalMs);

    this._eliteTimer = setInterval(() => {
      if (!this._disposed && this._eliteCount < this._cfg.maxElite &&
          Math.random() < this._cfg.eliteSpawnChance) {
        this._spawnElite();
      }
    }, this._cfg.eliteIntervalMs);

    this._bossTimer = setInterval(() => {
      if (!this._disposed && !this._bossActive) this._spawnBoss();
    }, this._cfg.bossIntervalMs);
  }

  /**
   * Called every game tick (50 ms). Removes fish whose duration has elapsed.
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
  }

  dispose(): void {
    this._disposed = true;
    if (this._normalTimer) clearInterval(this._normalTimer);
    if (this._eliteTimer)  clearInterval(this._eliteTimer);
    if (this._bossTimer)   clearInterval(this._bossTimer);
  }

  /** Called by GameRoom when a boss was killed by a player (not escaped). */
  bossKilled(fishId: string): void {
    this._bossActive = false;
    this._fishMap.delete(fishId);
  }

  // ---------------------------------------------------------------------------
  // Spawn helpers
  // ---------------------------------------------------------------------------

  private _spawnNormal(): void {
    const duration = 8_000 + Math.random() * 6_000; // 8-14s
    const speed    = 180   + Math.random() * 80;    // px/s
    const fish     = this._create('normal', 1, 1, speed, duration);
    this._fishMap.set(fish.fishId, fish);
    this._onSpawn(fish);
    this._normalCount++;
  }

  private _spawnElite(): void {
    const duration = 14_000 + Math.random() * 8_000; // 14-22s
    const speed    = 140    + Math.random() * 60;
    const reward   = 2 + Math.floor(Math.random() * 4); // 2-5
    const fish     = this._create('elite', 1, reward, speed, duration);
    this._fishMap.set(fish.fishId, fish);
    this._onSpawn(fish);
    this._eliteCount++;
  }

  private _spawnBoss(): void {
    const hp   = 10 + Math.floor(Math.random() * 11); // 10-20
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
  ): FishState {
    const fish         = new FishState();
    fish.fishId        = crypto.randomUUID();
    fish.fishType      = type;
    fish.hp            = hp;
    fish.maxHp         = hp;
    fish.alive         = true;
    fish.rewardMultiplier = reward;
    fish.speed         = speed;
    fish.startTimeMs   = Date.now();
    fish.durationMs    = duration;

    const path = this._genPath(type);
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
    // Pick an exit side that isn't the entry side
    const exits = sides.filter(s => s !== entrySide);
    const exitSide = exits[Math.floor(Math.random() * 3)];

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

    // Control points pull the path through the visible area
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
  // Internal remove
  // ---------------------------------------------------------------------------

  private _removeFish(fishId: string, escaped: boolean): void {
    const fish = this._fishMap.get(fishId);
    if (!fish) return;

    if (fish.fishType === 'normal') this._normalCount = Math.max(0, this._normalCount - 1);
    else if (fish.fishType === 'elite') this._eliteCount = Math.max(0, this._eliteCount - 1);
    else if (fish.fishType === 'boss')  this._bossActive = false;

    this._fishMap.delete(fishId);
    this._onDespawn(fishId, escaped);
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function rng(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
