import { _decorator, Component, Vec3 } from 'cc';

const { ccclass, property } = _decorator;

interface BezierPath {
  p0: Vec3;
  p1: Vec3;
  p2: Vec3;
  p3: Vec3;
  duration: number;
}

@ccclass('FishController')
export class FishController extends Component {
  private _path: BezierPath | null = null;
  private _elapsed = 0;
  private _fishId = '';

  init(fishId: string, path: BezierPath): void {
    this._fishId = fishId;
    this._path = path;
    this._elapsed = 0;
  }

  update(dt: number): void {
    if (!this._path) return;
    this._elapsed += dt;
    const t = Math.min(this._elapsed / this._path.duration, 1);
    const pos = this._bezier(this._path.p0, this._path.p1, this._path.p2, this._path.p3, t);
    this.node.setPosition(pos);
    if (t >= 1) {
      this.node.destroy();
    }
  }

  private _bezier(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
    const inv = 1 - t;
    return new Vec3(
      inv ** 3 * p0.x + 3 * inv ** 2 * t * p1.x + 3 * inv * t ** 2 * p2.x + t ** 3 * p3.x,
      inv ** 3 * p0.y + 3 * inv ** 2 * t * p1.y + 3 * inv * t ** 2 * p2.y + t ** 3 * p3.y,
      0,
    );
  }

  get fishId(): string {
    return this._fishId;
  }
}
