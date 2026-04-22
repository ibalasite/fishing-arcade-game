import { _decorator, Component, Label, director, Node, UITransform, Color, Layers } from 'cc';

const { ccclass } = _decorator;

@ccclass('Shop')
export class Shop extends Component {
  start() {
    this.buildUI();
  }

  private buildUI() {
    const canvas = this.node.parent!;

    this.makeLabel(canvas, 'SHOP', 64, 0, 220).getComponent(Label)!.isBold = true;
    this.makeLabel(canvas, '— Coming Soon —', 32, 0, 120);
    this.makeLabel(canvas, '◀  BACK', 40, 0, -100)
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

  onBackButtonClicked() {
    director.loadScene('MainMenu');
  }
}
