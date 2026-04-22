import { _decorator, Component, Label } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('JackpotDisplay')
export class JackpotDisplay extends Component {
  @property(Label)
  amountLabel: Label | null = null;

  private _current = 0;
  private _target = 0;

  setAmount(amount: number): void {
    this._target = amount;
    this._rollTo(amount);
  }

  private _rollTo(target: number): void {
    const start = this._current;
    const duration = 0.3;
    let elapsed = 0;

    const update = (dt: number) => {
      elapsed += dt;
      const t = Math.min(elapsed / duration, 1);
      const val = Math.round(start + (target - start) * t);
      this._current = val;
      if (this.amountLabel) this.amountLabel.string = val.toLocaleString();
      if (t < 1) return;
      this.unschedule(update);
    };

    this.schedule(update, 0);
  }
}
