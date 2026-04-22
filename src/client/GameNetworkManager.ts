// RED: implementation pending
// This stub exists so test imports resolve. Full implementation is in the client (Cocos Creator) project.

export type BulletType = 'normal' | 'spread' | 'laser' | 'bomb';

export interface ShootMessage {
  bulletType: BulletType;
  targetFishId: string;
}

export type StateChangeCallback = (state: unknown) => void;
export type ErrorCallback = (error: Error) => void;

/**
 * GameNetworkManager — wraps the Colyseus client SDK.
 * Handles room connection, message sending, and state change subscriptions.
 */
export class GameNetworkManager {
  private static _instance: GameNetworkManager | null = null;

  private _room: unknown = null;
  private _stateChangeCallbacks: StateChangeCallback[] = [];
  private _errorCallbacks: ErrorCallback[] = [];
  private _isConnected: boolean = false;
  private _reconnectAttempts: number = 0;
  private static readonly MAX_RECONNECT = 3;

  private constructor() {}

  static getInstance(): GameNetworkManager {
    if (!GameNetworkManager._instance) {
      GameNetworkManager._instance = new GameNetworkManager();
    }
    return GameNetworkManager._instance;
  }

  static resetInstance(): void {
    GameNetworkManager._instance = null;
  }

  /**
   * Connect to a Colyseus room by roomId.
   * Throws on connection failure after emitting error event.
   */
  async connectToRoom(roomId: string): Promise<void> {
    try {
      // In real impl: const client = new Colyseus.Client(SERVER_URL);
      //               this._room = await client.joinById(roomId);
      //               this._room.onStateChange(...)
      //               this._room.onLeave(...)
      void roomId;
      this._isConnected = true;
      this._reconnectAttempts = 0;
    } catch (err) {
      this._isConnected = false;
      const error = err instanceof Error ? err : new Error(String(err));
      this._errorCallbacks.forEach((cb) => cb(error));
      throw error;
    }
  }

  /**
   * Send a shoot message to the server.
   */
  sendShoot(bulletType: BulletType, targetFishId: string): void {
    if (!this._isConnected || !this._room) return;
    const msg: ShootMessage = { bulletType, targetFishId };
    // In real impl: this._room.send('shoot', msg);
    void msg;
  }

  /**
   * Register a callback to be invoked when server state changes.
   */
  onStateChange(cb: StateChangeCallback): void {
    this._stateChangeCallbacks.push(cb);
  }

  /**
   * Register an error event listener.
   */
  onError(cb: ErrorCallback): void {
    this._errorCallbacks.push(cb);
  }

  /**
   * Attempt reconnection when disconnected.
   */
  async reconnect(roomId: string): Promise<void> {
    if (this._reconnectAttempts >= GameNetworkManager.MAX_RECONNECT) {
      throw new Error('Max reconnect attempts exceeded');
    }
    this._reconnectAttempts++;
    await this.connectToRoom(roomId);
  }

  isConnected(): boolean {
    return this._isConnected;
  }

  getRoom(): unknown {
    return this._room;
  }

  /** For testing — inject a mock room. */
  _setRoom(room: unknown): void {
    this._room = room;
    this._isConnected = true;
  }

  /** For testing — trigger state change. */
  _triggerStateChange(state: unknown): void {
    this._stateChangeCallbacks.forEach((cb) => cb(state));
  }

  /** For testing — trigger error. */
  _triggerError(err: Error): void {
    this._errorCallbacks.forEach((cb) => cb(err));
  }
}
