import { _decorator, Component, Label } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('HUD')
export class HUD extends Component {
  @property(Label)
  goldLabel: Label | null = null;

  @property(Label)
  rtpLabel: Label | null = null;

  @property(Label)
  playerCountLabel: Label | null = null;

  setGold(amount: number): void {
    if (this.goldLabel) this.goldLabel.string = amount.toLocaleString();
  }

  setRtp(rtp: number): void {
    if (this.rtpLabel) this.rtpLabel.string = `RTP: ${rtp.toFixed(1)}%`;
  }

  setPlayerCount(count: number): void {
    if (this.playerCountLabel) this.playerCountLabel.string = `Players: ${count}/4`;
  }
}
