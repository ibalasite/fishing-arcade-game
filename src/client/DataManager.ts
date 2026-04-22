// RED: implementation pending
// This stub exists so test imports resolve. Full implementation is in the client (Cocos Creator) project.

export interface UserProfile {
  userId: string;
  nickname: string;
  gold: number;
  diamond: number;
}

/**
 * DataManager — persistent singleton caching player state.
 * Invalidated by server state patch callbacks.
 */
export class DataManager {
  private static _instance: DataManager | null = null;

  private _userId: string = '';
  private _nickname: string = '';
  private _gold: number = 0;
  private _diamond: number = 0;
  private _isDirty: boolean = false;

  private constructor() {}

  static getInstance(): DataManager {
    if (!DataManager._instance) {
      DataManager._instance = new DataManager();
    }
    return DataManager._instance;
  }

  /** For testing only — reset singleton between test suites. */
  static resetInstance(): void {
    DataManager._instance = null;
  }

  getUserId(): string {
    return this._userId;
  }

  setUserId(id: string): void {
    this._userId = id;
  }

  getNickname(): string {
    return this._nickname;
  }

  setNickname(name: string): void {
    this._nickname = name;
  }

  getGold(): number {
    return this._gold;
  }

  updateGold(amount: number): void {
    this._gold = amount;
  }

  getDiamond(): number {
    return this._diamond;
  }

  updateDiamond(amount: number): void {
    this._diamond = amount;
  }

  invalidateCache(): void {
    this._gold = 0;
    this._diamond = 0;
    this._isDirty = true;
  }

  isDirty(): boolean {
    return this._isDirty;
  }

  clearDirty(): void {
    this._isDirty = false;
  }
}
