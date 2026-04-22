import { _decorator, Component, Node, Vec2, EventTouch, input, Input } from 'cc';
import { GameNetworkManager, BulletType } from '../network/GameNetworkManager';

const { ccclass, property } = _decorator;

@ccclass('CannonController')
export class CannonController extends Component {
  @property({ type: Node })
  cannonBarrel: Node | null = null;

  @property({ type: Number })
  multiplier = 1;

  private _net = GameNetworkManager.getInstance();
  private _lastShootTime = 0;
  private static readonly SHOOT_COOLDOWN_MS = 200;

  onLoad() {
    input.on(Input.EventType.TOUCH_START, this._onTouchStart, this);
  }

  onDestroy() {
    input.off(Input.EventType.TOUCH_START, this._onTouchStart, this);
  }

  private _onTouchStart(event: EventTouch): void {
    const now = Date.now();
    if (now - this._lastShootTime < CannonController.SHOOT_COOLDOWN_MS) return;
    this._lastShootTime = now;

    const touchPos = event.getLocation();
    this._aimAt(touchPos);
    this._shoot('normal', 'fish-auto');
  }

  private _aimAt(pos: Vec2): void {
    if (!this.cannonBarrel) return;
    const angle = Math.atan2(pos.y - this.node.worldPosition.y, pos.x - this.node.worldPosition.x);
    this.cannonBarrel.angle = -(angle * 180) / Math.PI;
  }

  private _shoot(bulletType: BulletType, targetFishId: string): void {
    this._net.sendShoot({ bulletType, targetFishId });
  }

  setMultiplier(value: number): void {
    if (value < 1 || value > 100) return;
    this.multiplier = value;
  }
}
