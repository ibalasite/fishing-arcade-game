import { _decorator, Component, Label, director, Node, UITransform, Color, Layers } from 'cc';
import { GameNetworkManager } from './network/GameNetworkManager';

const { ccclass, property } = _decorator;

@ccclass('GameRoom')
export class GameRoom extends Component {
  @property(Label)
  jackpotLabel: Label | null = null;

  @property(Label)
  goldLabel: Label | null = null;

  private _net: GameNetworkManager = GameNetworkManager.getInstance();
  private _statusLabel: Label | null = null;

  async start() {
    this.buildUI();
    try {
      await this._net.connectToRoom('main');
      this._net.onStateChange((state: unknown) => this._onStateChange(state));
      if (this._statusLabel) this._statusLabel.string = '— Connected —';
    } catch (e) {
      console.error('[GameRoom] connection failed:', e);
      if (this._statusLabel) this._statusLabel.string = '— Server offline —';
    }
  }

  private buildUI() {
    const canvas = this.node.parent!;

    this.makeLabel(canvas, 'GAME ROOM', 64, 0, 220).getComponent(Label)!.isBold = true;

    if (!this.jackpotLabel) {
      this.jackpotLabel = this.makeLabel(canvas, 'Jackpot: ---', 40, 0, 120).getComponent(Label);
    }

    if (!this.goldLabel) {
      this.goldLabel = this.makeLabel(canvas, 'Gold: 0', 36, 0, 60).getComponent(Label);
    }

    this._statusLabel = this.makeLabel(canvas, '— Connecting… —', 28, 0, -20).getComponent(Label);

    this.makeLabel(canvas, '◀  BACK', 40, 0, -120)
        .on(Node.EventType.TOUCH_END, this.onBackButtonClicked, this);
  }

  private makeLabel(parent: Node, text: string, fontSize: number, x: number, y: number): Node {
    const node = new Node(text);
    node.layer = Layers.Enum.UI_2D;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    const tf = node.addComponent(UITransform);
    tf.setContentSize(700, fontSize + 20);
    const lbl = node.addComponent(Label);
    lbl.useSystemFont = true;
    lbl.fontFamily = 'Arial';
    lbl.string = text;
    lbl.fontSize = fontSize;
    lbl.lineHeight = fontSize + 4;
    lbl.horizontalAlign = Label.HorizontalAlign.CENTER;
    lbl.verticalAlign = Label.VerticalAlign.CENTER;
    lbl.color = new Color(255, 255, 255, 255);
    return node;
  }

  private _onStateChange(state: unknown) {
    const s = state as Record<string, unknown>;
    if (this.jackpotLabel && s.jackpotPool !== undefined) {
      this.jackpotLabel.string = `Jackpot: ${Math.round(Number(s.jackpotPool)).toLocaleString()}`;
    }
  }

  onDestroy() {
    // room.leave() is handled by GameNetworkManager
  }

  onBackButtonClicked() {
    director.loadScene('MainMenu');
  }
}
