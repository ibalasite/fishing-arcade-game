// RED: implementation pending
/**
 * DataManager Tests — TDD contract for the persistent client-side state singleton.
 *
 * Cocos Creator mock environment: cc.* APIs are mocked via __mocks__/cc.ts
 */

import { DataManager } from '../../src/client/DataManager';

describe('DataManager', () => {
  beforeEach(() => {
    DataManager.resetInstance();
  });

  // ---- Singleton behaviour ----

  describe('singleton', () => {
    it('returns the same instance on multiple calls', () => {
      // Given: DataManager has not been created yet
      // When: getInstance is called twice
      const a = DataManager.getInstance();
      const b = DataManager.getInstance();
      // Then: both references point to the same object
      expect(a).toBe(b);
    });

    it('creates a fresh instance after resetInstance()', () => {
      // Given: an existing instance
      const original = DataManager.getInstance();
      // When: resetInstance is called and getInstance is called again
      DataManager.resetInstance();
      const fresh = DataManager.getInstance();
      // Then: the new instance is different from the original
      expect(fresh).not.toBe(original);
    });
  });

  // ---- Gold management ----

  describe('updateGold', () => {
    it('updates cached gold to the provided amount', () => {
      // Given: a DataManager instance
      const dm = DataManager.getInstance();
      // When: updateGold is called with 500
      dm.updateGold(500);
      // Then: getGold returns 500
      expect(dm.getGold()).toBe(500);
    });

    it('overwrites a previous gold value with the new amount', () => {
      // Given: gold was previously set to 200
      const dm = DataManager.getInstance();
      dm.updateGold(200);
      // When: updateGold is called with 750
      dm.updateGold(750);
      // Then: getGold returns the latest value
      expect(dm.getGold()).toBe(750);
    });

    it('accepts zero as a valid gold amount', () => {
      // Given: gold was set to 1000
      const dm = DataManager.getInstance();
      dm.updateGold(1000);
      // When: updateGold is called with 0
      dm.updateGold(0);
      // Then: getGold returns 0
      expect(dm.getGold()).toBe(0);
    });
  });

  // ---- Diamond management ----

  describe('updateDiamond', () => {
    it('updates cached diamond to the provided amount', () => {
      // Given: a DataManager instance
      const dm = DataManager.getInstance();
      // When: updateDiamond is called with 100
      dm.updateDiamond(100);
      // Then: getDiamond returns 100
      expect(dm.getDiamond()).toBe(100);
    });

    it('overwrites a previous diamond value', () => {
      // Given: diamond was set to 50
      const dm = DataManager.getInstance();
      dm.updateDiamond(50);
      // When: updateDiamond is called with 200
      dm.updateDiamond(200);
      // Then: getDiamond returns 200
      expect(dm.getDiamond()).toBe(200);
    });
  });

  // ---- Cache invalidation ----

  describe('invalidateCache', () => {
    it('resets gold and diamond to 0 when cache is invalidated', () => {
      // Given: gold and diamond are populated
      const dm = DataManager.getInstance();
      dm.updateGold(1000);
      dm.updateDiamond(50);
      // When: invalidateCache is called (triggered by server state patch)
      dm.invalidateCache();
      // Then: both values are reset
      expect(dm.getGold()).toBe(0);
      expect(dm.getDiamond()).toBe(0);
    });

    it('marks the instance as dirty after cache invalidation', () => {
      // Given: a clean DataManager instance
      const dm = DataManager.getInstance();
      expect(dm.isDirty()).toBe(false);
      // When: invalidateCache is called
      dm.invalidateCache();
      // Then: isDirty returns true
      expect(dm.isDirty()).toBe(true);
    });

    it('clears the dirty flag when clearDirty is called', () => {
      // Given: cache has been invalidated (dirty)
      const dm = DataManager.getInstance();
      dm.invalidateCache();
      // When: clearDirty is called
      dm.clearDirty();
      // Then: isDirty returns false
      expect(dm.isDirty()).toBe(false);
    });
  });

  // ---- User identity ----

  describe('getUserId', () => {
    it('returns the stored userId', () => {
      // Given: a DataManager instance
      const dm = DataManager.getInstance();
      // When: setUserId is called with a known id
      dm.setUserId('user-42');
      // Then: getUserId returns the same id
      expect(dm.getUserId()).toBe('user-42');
    });

    it('returns empty string when no userId has been set', () => {
      // Given: a fresh DataManager instance (reset before test)
      const dm = DataManager.getInstance();
      // Then: getUserId returns empty string
      expect(dm.getUserId()).toBe('');
    });
  });

  // ---- Nickname ----

  describe('nickname', () => {
    it('stores and retrieves the player nickname', () => {
      // Given: a DataManager instance
      const dm = DataManager.getInstance();
      // When: setNickname is called
      dm.setNickname('PlayerOne');
      // Then: getNickname returns the same value
      expect(dm.getNickname()).toBe('PlayerOne');
    });
  });
});
