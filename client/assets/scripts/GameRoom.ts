import { _decorator, Component, Label, director } from 'cc';
import { GameNetworkManager } from './network/GameNetworkManager';

const { ccclass, property } = _decorator;

@ccclass('GameRoom')
export class GameRoom extends Component {
  @property(Label)
  jackpotLabel: Label | null = null;

  @property(Label)
  goldLabel: Label | null = null;

  private _net: GameNetworkManager = GameNetworkManager.getInstance();

  async start() {
    try {
      await this._net.connectToRoom('main');
      this._net.onStateChange((state: unknown) => this._onStateChange(state));
    } catch (e) {
      console.error('[GameRoom] connection failed:', e);
      director.loadScene('MainMenu');
    }
  }

  private _onStateChange(state: unknown) {
    const s = state as Record<string, unknown>;
    if (this.jackpotLabel && s.jackpotPool !== undefined) {
      this.jackpotLabel.string = `${Math.round(Number(s.jackpotPool)).toLocaleString()}`;
    }
  }

  onDestroy() {
    // room.leave() is handled by GameNetworkManager
  }

  onBackButtonClicked() {
    director.loadScene('MainMenu');
  }
}
