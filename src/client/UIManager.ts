// RED: implementation pending
// This stub exists so test imports resolve. Full implementation is in the client (Cocos Creator) project.

export interface LabelLike {
  string: string;
}

export interface NodeLike {
  name: string;
  active: boolean;
  position: { x: number; y: number; z: number };
  getComponent(type: unknown): unknown;
}

/**
 * UIManager — manages HUD labels and game effects.
 */
export class UIManager {
  private static _instance: UIManager | null = null;

  private _goldLabel: LabelLike | null = null;
  private _diamondLabel: LabelLike | null = null;
  private _jackpotNode: NodeLike | null = null;
  private _fishNodes: Map<string, NodeLike> = new Map();

  private constructor() {}

  static getInstance(): UIManager {
    if (!UIManager._instance) {
      UIManager._instance = new UIManager();
    }
    return UIManager._instance;
  }

  static resetInstance(): void {
    UIManager._instance = null;
  }

  setGoldLabel(label: LabelLike): void {
    this._goldLabel = label;
  }

  setDiamondLabel(label: LabelLike): void {
    this._diamondLabel = label;
  }

  setJackpotNode(node: NodeLike): void {
    this._jackpotNode = node;
  }

  registerFishNode(fishId: string, node: NodeLike): void {
    this._fishNodes.set(fishId, node);
  }

  unregisterFishNode(fishId: string): void {
    this._fishNodes.delete(fishId);
  }

  /**
   * Update gold HUD label.
   */
  updateGold(amount: number): void {
    if (!this._goldLabel) {
      console.warn('[UIManager] goldLabel not set');
      return;
    }
    this._goldLabel.string = String(amount);
  }

  /**
   * Update diamond HUD label.
   */
  updateDiamond(amount: number): void {
    if (!this._diamondLabel) {
      console.warn('[UIManager] diamondLabel not set');
      return;
    }
    this._diamondLabel.string = String(amount);
  }

  /**
   * Show jackpot celebration animation with winnings amount.
   */
  showJackpotAnimation(amount: number): void {
    if (!this._jackpotNode) {
      console.warn('[UIManager] jackpotNode not set');
      return;
    }
    this._jackpotNode.active = true;
    // In real impl: play animation + display amount label
    void amount;
  }

  /**
   * Play kill effect at the fish's last known position.
   * Silently logs if fish node not found.
   */
  showKillEffect(fishId: string): void {
    const fishNode = this._fishNodes.get(fishId);
    if (!fishNode) {
      console.warn(`[UIManager] fish node not found for fishId: ${fishId}`);
      return;
    }
    // In real impl: spawn particle effect at fishNode.position
    void fishNode;
  }

  getGoldLabel(): LabelLike | null {
    return this._goldLabel;
  }

  getDiamondLabel(): LabelLike | null {
    return this._diamondLabel;
  }
}
