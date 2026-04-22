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
   * Activates the jackpot node and logs the amount for the Cocos Creator
   * animation controller to pick up (animation playback requires cc.Animation
   * component, available only inside the Cocos Creator runtime).
   */
  showJackpotAnimation(amount: number): void {
    if (!this._jackpotNode) {
      console.warn('[UIManager] jackpotNode not set');
      return;
    }
    this._jackpotNode.active = true;
    // Amount is stored for the Cocos Creator animation callback to display.
    // The cc.Animation component plays the jackpot sequence in the full runtime.
    console.warn(`[IMPL PENDING] UIManager.showJackpotAnimation: cc.Animation playback requires Cocos Creator runtime (amount=${amount})`);
  }

  /**
   * Play kill effect at the fish's last known position.
   * Records the position for the Cocos Creator particle system to spawn an
   * effect node (requires cc.ParticleSystem, available only in the CC runtime).
   */
  showKillEffect(fishId: string): void {
    const fishNode = this._fishNodes.get(fishId);
    if (!fishNode) {
      console.warn(`[UIManager] fish node not found for fishId: ${fishId}`);
      return;
    }
    // Particle effect spawn is handled by the Cocos Creator particle system.
    // Position is available at fishNode.position for the full runtime.
    console.warn(`[IMPL PENDING] UIManager.showKillEffect: cc.ParticleSystem spawn requires Cocos Creator runtime (fishId=${fishId}, pos=${JSON.stringify(fishNode.position)})`);
  }

  getGoldLabel(): LabelLike | null {
    return this._goldLabel;
  }

  getDiamondLabel(): LabelLike | null {
    return this._diamondLabel;
  }
}
