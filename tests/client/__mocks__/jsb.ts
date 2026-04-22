/**
 * JSB (JavaScript Binding) native bridge mock for Jest.
 * Simulates iOS Keychain / Android Keystore via an in-memory store.
 */

const _keychainStore: Record<string, string> = {};

export const reflection = {
  /**
   * Simulates jsb.reflection.callStaticMethod used to bridge to
   * native iOS/Android APIs such as Keychain/Keystore.
   *
   * Supported virtual class paths:
   *   - "com/example/SecureStorage/saveToken"  → save key-value
   *   - "com/example/SecureStorage/getToken"   → retrieve value
   *   - "com/example/SecureStorage/clearToken" → delete value
   */
  callStaticMethod: jest.fn(
    (className: string, methodName: string, signature: string, ...args: string[]): string | null => {
      const key = `${className}#${methodName}`;
      if (methodName === 'saveToken' || methodName === 'save') {
        const [token, storageKey = 'auth_token'] = args;
        _keychainStore[storageKey] = token;
        return 'OK';
      }
      if (methodName === 'getToken' || methodName === 'get') {
        const [storageKey = 'auth_token'] = args;
        return _keychainStore[storageKey] ?? null;
      }
      if (methodName === 'clearToken' || methodName === 'clear' || methodName === 'delete') {
        const [storageKey = 'auth_token'] = args;
        delete _keychainStore[storageKey];
        return 'OK';
      }
      void key;
      void signature;
      return null;
    }
  ),
};

/** Reset the in-memory keychain store between tests. */
export function __resetKeychainStore(): void {
  Object.keys(_keychainStore).forEach((k) => delete _keychainStore[k]);
}

/** Expose raw store for assertions in tests. */
export function __getKeychainStore(): Record<string, string> {
  return { ..._keychainStore };
}

const jsb = { reflection };
export default jsb;
