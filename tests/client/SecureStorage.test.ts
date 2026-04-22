// RED: implementation pending
/**
 * SecureStorage Tests — TDD contract for the native bridge token storage.
 *
 * Tests verify that jsb.reflection is called with correct arguments and that
 * the fallback to cc.sys.localStorage works when jsb is unavailable.
 */

import { SecureStorage } from '../../src/client/SecureStorage';
import { __resetKeychainStore } from './__mocks__/jsb';
import { sys as ccSys } from './__mocks__/cc';

/** Install jsb on globalThis so SecureStorage can detect it. */
function installJsb(): void {
  const { reflection } = jest.requireActual<typeof import('./__mocks__/jsb')>('./__mocks__/jsb');
  (globalThis as Record<string, unknown>).jsb = { reflection };
}

/** Remove jsb from globalThis (simulates web/editor environment). */
function removeJsb(): void {
  delete (globalThis as Record<string, unknown>).jsb;
}

/** Install cc mock on globalThis so fallback path can use cc.sys.localStorage. */
function installCcSys(): void {
  (globalThis as Record<string, unknown>).cc = { sys: ccSys };
  ccSys.localStorage.clear();
}

describe('SecureStorage', () => {
  beforeEach(() => {
    SecureStorage.resetInstance();
    __resetKeychainStore();
    removeJsb();
  });

  afterEach(() => {
    removeJsb();
    delete (globalThis as Record<string, unknown>).cc;
  });

  // ---- saveToken via jsb.reflection ----

  describe('saveToken (native path)', () => {
    it('calls jsb.reflection.callStaticMethod with correct args when jsb is available', () => {
      // Given: jsb is available on globalThis
      const jsbMock = require('./__mocks__/jsb');
      (globalThis as Record<string, unknown>).jsb = { reflection: jsbMock.reflection };
      const storage = SecureStorage.getInstance();
      // When: saveToken is called
      storage.saveToken('jwt-abc-123');
      // Then: jsb.reflection.callStaticMethod was called
      expect(jsbMock.reflection.callStaticMethod).toHaveBeenCalled();
    });

    it('persists the token so getToken can retrieve it', () => {
      // Given: jsb is available
      const jsbMock = require('./__mocks__/jsb');
      (globalThis as Record<string, unknown>).jsb = { reflection: jsbMock.reflection };
      const storage = SecureStorage.getInstance();
      // When: token is saved and then retrieved
      storage.saveToken('secret-token-xyz');
      const retrieved = storage.getToken();
      // Then: the same token is returned
      expect(retrieved).toBe('secret-token-xyz');
    });
  });

  // ---- getToken ----

  describe('getToken', () => {
    it('returns null when no token has been stored', () => {
      // Given: empty secure storage (no jsb, no cc.sys.localStorage token)
      installCcSys();
      const storage = SecureStorage.getInstance();
      // When: getToken is called on a fresh instance
      const token = storage.getToken();
      // Then: null is returned
      expect(token).toBeNull();
    });

    it('retrieves a previously saved token from localStorage fallback', () => {
      // Given: jsb is NOT available — fallback to cc.sys.localStorage
      installCcSys();
      ccSys.localStorage.setItem('auth_token', 'fallback-token-42');
      const storage = SecureStorage.getInstance();
      // When: getToken is called
      const token = storage.getToken();
      // Then: the stored token is returned
      expect(token).toBe('fallback-token-42');
    });
  });

  // ---- clearToken ----

  describe('clearToken', () => {
    it('removes the stored token so getToken returns null afterwards', () => {
      // Given: jsb is available and a token has been saved
      const jsbMock = require('./__mocks__/jsb');
      (globalThis as Record<string, unknown>).jsb = { reflection: jsbMock.reflection };
      const storage = SecureStorage.getInstance();
      storage.saveToken('token-to-delete');
      expect(storage.getToken()).not.toBeNull();
      // When: clearToken is called
      storage.clearToken();
      // Then: getToken returns null
      const token = storage.getToken();
      expect(token).toBeNull();
    });
  });

  // ---- Fallback behaviour when jsb throws ----

  describe('fallback on jsb.reflection error', () => {
    it('falls back to cc.sys.localStorage when jsb.reflection throws', () => {
      // Given: jsb is available but callStaticMethod throws
      const faultyJsb = {
        reflection: {
          callStaticMethod: jest.fn(() => {
            throw new Error('Native bridge unavailable');
          }),
        },
      };
      (globalThis as Record<string, unknown>).jsb = faultyJsb;
      installCcSys();
      const storage = SecureStorage.getInstance();
      // When: saveToken is called (jsb throws)
      expect(() => storage.saveToken('fallback-safe')).not.toThrow();
      // Then: token is stored in localStorage instead
      expect(ccSys.localStorage.getItem('auth_token')).toBe('fallback-safe');
    });

    it('does NOT throw when jsb throws on clearToken', () => {
      // Given: jsb throws on clear
      const faultyJsb = {
        reflection: {
          callStaticMethod: jest.fn(() => {
            throw new Error('Native bridge error');
          }),
        },
      };
      (globalThis as Record<string, unknown>).jsb = faultyJsb;
      installCcSys();
      const storage = SecureStorage.getInstance();
      // When / Then: no exception propagated
      expect(() => storage.clearToken()).not.toThrow();
    });
  });

  // ---- getToken fallback paths ----

  describe('getToken fallback — no cc.sys.localStorage', () => {
    it('returns null when no jsb and no cc.sys available', () => {
      // Given: jsb removed, no cc installed
      removeJsb();
      // cc is not installed (afterEach removes it, but beforeEach has removeJsb)
      const storage = SecureStorage.getInstance();
      // When: getToken is called
      const token = storage.getToken();
      // Then: null because no storage available
      expect(token).toBeNull();
    });
  });

  // ---- clearToken without jsb (else branch) ----

  describe('clearToken — no jsb (localStorage fallback)', () => {
    it('removes token from localStorage when jsb is unavailable', () => {
      // Given: no jsb, cc.sys.localStorage has a token
      installCcSys();
      ccSys.localStorage.setItem('auth_token', 'token-to-clear');
      const storage = SecureStorage.getInstance();
      // When: clearToken called without jsb
      storage.clearToken();
      // Then: token removed from localStorage
      expect(ccSys.localStorage.getItem('auth_token')).toBeNull();
    });
  });

  // ---- getToken jsb throws — catch fallback ----

  describe('getToken — jsb throws fallback', () => {
    it('falls back to localStorage when jsb.reflection throws on getToken', () => {
      // Given: jsb throws on callStaticMethod
      const faultyJsb = {
        reflection: {
          callStaticMethod: jest.fn(() => {
            throw new Error('Reflection error');
          }),
        },
      };
      (globalThis as Record<string, unknown>).jsb = faultyJsb;
      installCcSys();
      ccSys.localStorage.setItem('auth_token', 'fallback-retrieved');
      const storage = SecureStorage.getInstance();
      // When: getToken is called (jsb throws → falls back to localStorage)
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      const token = storage.getToken();
      // Then: token retrieved from localStorage
      expect(token).toBe('fallback-retrieved');
      warnSpy.mockRestore();
    });
  });
});
