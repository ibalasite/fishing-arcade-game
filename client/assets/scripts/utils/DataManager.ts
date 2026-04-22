export class DataManager {
  private static _instance: DataManager | null = null;
  private _data: Map<string, unknown> = new Map();

  static getInstance(): DataManager {
    if (!DataManager._instance) {
      DataManager._instance = new DataManager();
    }
    return DataManager._instance;
  }

  init(): void {
    this._data.clear();
  }

  set<T>(key: string, value: T): void {
    this._data.set(key, value);
  }

  get<T>(key: string): T | undefined {
    return this._data.get(key) as T | undefined;
  }

  remove(key: string): void {
    this._data.delete(key);
  }

  has(key: string): boolean {
    return this._data.has(key);
  }
}
