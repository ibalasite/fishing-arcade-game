import { _decorator, Component, director } from 'cc';
import { DataManager } from './utils/DataManager';
import { SecureStorage } from './utils/SecureStorage';

const { ccclass, property } = _decorator;

@ccclass('Boot')
export class Boot extends Component {
  start() {
    // Make Boot node persist across scenes
    director.addPersistRootNode(this.node.parent!);

    DataManager.getInstance().init();

    // Check if user has accepted privacy consent
    const hasConsent = SecureStorage.getInstance().get('privacy_consent_v1');
    if (!hasConsent) {
      // Show privacy modal first (implemented in MainMenu)
      director.loadScene('MainMenu');
    } else {
      director.loadScene('MainMenu');
    }
  }
}
