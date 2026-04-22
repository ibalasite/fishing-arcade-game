// Colyseus client is bundled via the colyseus-plugin or loaded via cdn.
// In CC4, import from the plugin bundle: import { Client, Room } from 'colyseus.js'
// For scaffold purposes, we declare the shape and inject at runtime.

export type BulletType = 'normal' | 'spread' | 'laser' | 'bomb';

export interface ShootMessage {
  bulletType: BulletType;
  targetFishId: string;
}

type StateCallback = (state: unknown) => void;
type ErrorCallback = (error: Error) => void;

declare const Colyseus: { Client: new (url: string) => ColyseusClient };
interface ColyseusClient {
  joinOrCreate(roomType: string, options?: Record<string, unknown>): Promise<ColyseusRoom>;
}
interface ColyseusRoom {
  id: string;
  sessionId: string;
  send(type: string, payload?: unknown): void;
  leave(): void;
  onStateChange(cb: (state: unknown) => void): void;
  onMessage(type: string, cb: (msg: unknown) => void): void;
  onLeave(cb: (code: number) => void): void;
  onError(cb: (code: number, msg: string) => void): void;
}

export class GameNetworkManager {
  private static _instance: GameNetworkManager | null = null;
  private _room: ColyseusRoom | null = null;
  private _stateCallbacks: StateCallback[] = [];
  private _errorCallbacks: ErrorCallback[] = [];
  private _isConnected = false;
  private static readonly SERVER_URL = 'ws://localhost:3000';

  static getInstance(): GameNetworkManager {
    if (!GameNetworkManager._instance) {
      GameNetworkManager._instance = new GameNetworkManager();
    }
    return GameNetworkManager._instance;
  }

  async connectToRoom(_roomId: string): Promise<void> {
    const client = new Colyseus.Client(GameNetworkManager.SERVER_URL);
    this._room = await client.joinOrCreate('fishing_room');
    this._isConnected = true;

    this._room.onStateChange((state) => {
      this._stateCallbacks.forEach((cb) => cb(state));
    });

    this._room.onLeave((code) => {
      this._isConnected = false;
      console.log('[Net] Left room, code:', code);
    });

    this._room.onError((code, msg) => {
      const err = new Error(`Room error ${code}: ${msg}`);
      this._errorCallbacks.forEach((cb) => cb(err));
    });
  }

  onStateChange(cb: StateCallback): void {
    this._stateCallbacks.push(cb);
  }

  onError(cb: ErrorCallback): void {
    this._errorCallbacks.push(cb);
  }

  sendShoot(msg: ShootMessage): void {
    if (!this._room) return;
    this._room.send('shoot', msg);
  }

  disconnect(): void {
    if (this._room) {
      this._room.leave();
      this._room = null;
    }
    this._isConnected = false;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  static resetInstance(): void {
    GameNetworkManager._instance = null;
  }
}
