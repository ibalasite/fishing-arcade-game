import { _decorator, Component, director } from 'cc';

const { ccclass } = _decorator;

@ccclass('Shop')
export class Shop extends Component {
  start() {
    // Shop scene controller
  }

  onBackButtonClicked() {
    director.loadScene('MainMenu');
  }
}
