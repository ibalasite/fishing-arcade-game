export class SecureStorage {
  private static _instance: SecureStorage | null = null;

  static getInstance(): SecureStorage {
    if (!SecureStorage._instance) {
      SecureStorage._instance = new SecureStorage();
    }
    return SecureStorage._instance;
  }

  set(key: string, value: string): void {
    try {
      // In Cocos Creator native: sys.localStorage.setItem
      localStorage.setItem(this._prefix(key), btoa(value));
    } catch {
      console.warn('[SecureStorage] set failed for key:', key);
    }
  }

  get(key: string): string | null {
    try {
      const raw = localStorage.getItem(this._prefix(key));
      return raw ? atob(raw) : null;
    } catch {
      return null;
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(this._prefix(key));
    } catch {
      console.warn('[SecureStorage] remove failed for key:', key);
    }
  }

  private _prefix(key: string): string {
    return `fag_${key}`;
  }
}
