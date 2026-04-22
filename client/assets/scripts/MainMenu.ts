import { _decorator, Component, Label, Button, director } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('MainMenu')
export class MainMenu extends Component {
  @property(Label)
  jackpotLabel: Label | null = null;

  @property(Button)
  playButton: Button | null = null;

  start() {
    this.fetchJackpot();
  }

  private async fetchJackpot() {
    try {
      const res = await fetch('http://localhost:3000/api/v1/game/jackpot/pool');
      const json = await res.json();
      if (this.jackpotLabel) {
        this.jackpotLabel.string = `Jackpot: ${json.data.amount.toLocaleString()}`;
      }
    } catch (e) {
      console.warn('[MainMenu] fetchJackpot failed:', e);
    }
  }

  onPlayButtonClicked() {
    director.loadScene('GameRoom');
  }

  onShopButtonClicked() {
    director.loadScene('Shop');
  }
}
