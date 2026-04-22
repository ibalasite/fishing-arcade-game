import { _decorator, Component, Label, Button, director, Node, UITransform, Color, Layers, Camera } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('MainMenu')
export class MainMenu extends Component {
  @property(Label)
  jackpotLabel: Label | null = null;

  @property(Button)
  playButton: Button | null = null;

  start() {
    console.log('[MainMenu] start(), jackpotLabel=', this.jackpotLabel);
    console.log('[MainMenu] Layers.Enum.UI_2D=', Layers.Enum.UI_2D);
    console.log('[MainMenu] this.node.parent=', this.node.parent?.name);
    if (!this.jackpotLabel) {
      this.buildUI();
    }
    this.fetchJackpot();
  }

  private buildUI() {
    console.log('[MainMenu] buildUI() called');
    const canvas = this.node.parent!;
    console.log('[MainMenu] canvas=', canvas.name, 'children=', canvas.children.length);

    // Log any cameras in scene
    const allCameras = canvas.getComponentsInChildren(Camera);
    console.log('[MainMenu] cameras in canvas children=', allCameras.length);

    const titleNode = this.makeLabel(canvas, 'Fishing Arcade', 64, 0, 220);
    titleNode.getComponent(Label)!.isBold = true;

    const jackpotNode = this.makeLabel(canvas, 'Jackpot: ---', 40, 0, 120);
    this.jackpotLabel = jackpotNode.getComponent(Label);

    const playNode = this.makeLabel(canvas, '▶  PLAY', 44, 0, 0);
    playNode.on(Node.EventType.TOUCH_END, this.onPlayButtonClicked, this);

    this.makeLabel(canvas, 'SHOP', 36, 0, -80)
        .on(Node.EventType.TOUCH_END, this.onShopButtonClicked, this);

    console.log('[MainMenu] buildUI done, canvas children=', canvas.children.length);
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
    console.log('[MainMenu] makeLabel', text, 'layer=', node.layer, 'pos=', node.getPosition().toString());
    return node;
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
