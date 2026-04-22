export type BulletType = 'normal' | 'spread' | 'laser' | 'bomb';

export interface ShootEvent {
  bulletType: BulletType;
  angle: number;
}

export type ShootListener = (event: ShootEvent) => void;

/**
 * CannonController — manages cannon rotation, bullet type selection, and fire rate limiting.
 */
export class CannonController {
  private static _instance: CannonController | null = null;

  private _currentBulletType: BulletType = 'normal';
  private _currentAngle: number = 0;
  private _isCoolingDown: boolean = false;
  private _cooldownMs: number = 500;
  private _shootListeners: ShootListener[] = [];

  private constructor() {}

  static getInstance(): CannonController {
    if (!CannonController._instance) {
      CannonController._instance = new CannonController();
    }
    return CannonController._instance;
  }

  static resetInstance(): void {
    CannonController._instance = null;
  }

  setCooldownMs(ms: number): void {
    this._cooldownMs = ms;
  }

  /**
   * Fire the cannon with current bullet type.
   * Ignored when cooling down (rate limit enforcement).
   */
  fire(bulletType?: BulletType): void {
    if (this._isCoolingDown) return;
    const type = bulletType ?? this._currentBulletType;
    const event: ShootEvent = { bulletType: type, angle: this._currentAngle };
    this._shootListeners.forEach((cb) => cb(event));
    this._startCooldown();
  }

  private _startCooldown(): void {
    this._isCoolingDown = true;
    setTimeout(() => {
      this._isCoolingDown = false;
    }, this._cooldownMs);
  }

  /**
   * Rotate the cannon to the given angle (degrees).
   * Updates the authoritative angle used in shoot events.
   * The Cocos Creator node visual rotation is applied via cc.Node.setRotationFromEuler
   * in the full runtime (requires cc.Node component).
   */
  rotateTo(angle: number): void {
    this._currentAngle = angle;
    // Node rotation sync (cc.Node.setRotationFromEuler) applied in Cocos Creator runtime.
  }

  /**
   * Get the currently selected bullet type.
   */
  getCurrentBulletType(): BulletType {
    return this._currentBulletType;
  }

  /**
   * Switch to a new bullet type.
   */
  switchBulletType(type: BulletType): void {
    this._currentBulletType = type;
  }

  /**
   * Register a shoot event listener.
   */
  onShoot(cb: ShootListener): void {
    this._shootListeners.push(cb);
  }

  /** For testing — expose cooldown state. */
  _isCoolingDownState(): boolean {
    return this._isCoolingDown;
  }

  /** For testing — force cooldown state. */
  _setCoolingDown(value: boolean): void {
    this._isCoolingDown = value;
  }
}
