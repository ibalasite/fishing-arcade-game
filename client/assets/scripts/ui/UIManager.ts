import { _decorator, Component, Node } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('UIManager')
export class UIManager extends Component {
  private static _instance: UIManager | null = null;

  @property({ type: Node })
  modalContainer: Node | null = null;

  static getInstance(): UIManager | null {
    return UIManager._instance;
  }

  onLoad(): void {
    UIManager._instance = this;
  }

  onDestroy(): void {
    UIManager._instance = null;
  }

  showToast(message: string, durationSec = 2): void {
    console.log(`[UI Toast] ${message} (${durationSec}s)`);
    // TODO: instantiate ToastPrefab and animate
  }

  showModal(prefabName: string, data?: Record<string, unknown>): void {
    console.log(`[UI Modal] show: ${prefabName}`, data);
    // TODO: load prefab from resources and push to modalContainer
  }

  hideModal(): void {
    if (!this.modalContainer) return;
    // TODO: pop from modal stack
  }
}
