// RED: implementation pending
// This stub exists so test imports resolve. Full implementation is in the client (Cocos Creator) project.

const TOKEN_KEY = 'auth_token';
const JSB_CLASS = 'com/example/SecureStorage';

/**
 * SecureStorage — wraps jsb.reflection to use iOS Keychain / Android Keystore.
 * Falls back to cc.sys.localStorage when jsb is unavailable (web / editor).
 */
export class SecureStorage {
  private static _instance: SecureStorage | null = null;

  private constructor() {}

  static getInstance(): SecureStorage {
    if (!SecureStorage._instance) {
      SecureStorage._instance = new SecureStorage();
    }
    return SecureStorage._instance;
  }

  static resetInstance(): void {
    SecureStorage._instance = null;
  }

  /**
   * Save authentication token to native secure storage.
   * Falls back to cc.sys.localStorage on web platforms.
   */
  saveToken(token: string): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsbRef = (globalThis as any).jsb;
      if (jsbRef?.reflection) {
        jsbRef.reflection.callStaticMethod(JSB_CLASS, 'saveToken', '(Ljava/lang/String;)V', token, TOKEN_KEY);
      } else {
        this._fallbackSave(TOKEN_KEY, token);
      }
    } catch (err) {
      // Graceful fallback — log and use localStorage
      console.warn('[SecureStorage] jsb.reflection failed, falling back to localStorage', err);
      this._fallbackSave(TOKEN_KEY, token);
    }
  }

  /**
   * Retrieve authentication token from secure storage.
   * Returns null if not found.
   */
  getToken(): string | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsbRef = (globalThis as any).jsb;
      if (jsbRef?.reflection) {
        return jsbRef.reflection.callStaticMethod(JSB_CLASS, 'getToken', '()Ljava/lang/String;', TOKEN_KEY);
      }
      return this._fallbackGet(TOKEN_KEY);
    } catch (err) {
      console.warn('[SecureStorage] jsb.reflection failed, falling back to localStorage', err);
      return this._fallbackGet(TOKEN_KEY);
    }
  }

  /**
   * Clear the stored authentication token.
   */
  clearToken(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jsbRef = (globalThis as any).jsb;
      if (jsbRef?.reflection) {
        jsbRef.reflection.callStaticMethod(JSB_CLASS, 'clearToken', '(Ljava/lang/String;)V', TOKEN_KEY);
      } else {
        this._fallbackRemove(TOKEN_KEY);
      }
    } catch (err) {
      console.warn('[SecureStorage] jsb.reflection failed, falling back to localStorage', err);
      this._fallbackRemove(TOKEN_KEY);
    }
  }

  private _fallbackSave(key: string, value: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ccSys = (globalThis as any).cc?.sys;
    if (ccSys?.localStorage) {
      ccSys.localStorage.setItem(key, value);
    }
  }

  private _fallbackGet(key: string): string | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ccSys = (globalThis as any).cc?.sys;
    if (ccSys?.localStorage) {
      return ccSys.localStorage.getItem(key);
    }
    return null;
  }

  private _fallbackRemove(key: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ccSys = (globalThis as any).cc?.sys;
    if (ccSys?.localStorage) {
      ccSys.localStorage.removeItem(key);
    }
  }
}
