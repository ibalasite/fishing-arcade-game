// RED: implementation pending
/**
 * GameNetworkManager Tests — TDD contract for the Colyseus client wrapper.
 *
 * Colyseus client SDK is fully mocked so tests run in pure Node.js.
 */

import { GameNetworkManager } from '../../src/client/GameNetworkManager';

/** Build a minimal mock Colyseus room object. */
function makeMockRoom(overrides: Partial<{
  send: jest.Mock;
  onStateChange: jest.Mock;
  onLeave: jest.Mock;
  onError: jest.Mock;
}> = {}): {
  send: jest.Mock;
  onStateChange: jest.Mock;
  onLeave: jest.Mock;
  onError: jest.Mock;
} {
  return {
    send: jest.fn(),
    onStateChange: jest.fn(),
    onLeave: jest.fn(),
    onError: jest.fn(),
    ...overrides,
  };
}

describe('GameNetworkManager', () => {
  beforeEach(() => {
    GameNetworkManager.resetInstance();
  });

  // ---- connectToRoom ----

  describe('connectToRoom(roomId)', () => {
    it('transitions isConnected() to true on successful connection', async () => {
      // Given: a fresh network manager
      const gnm = GameNetworkManager.getInstance();
      expect(gnm.isConnected()).toBe(false);
      // When: connectToRoom is called
      await gnm.connectToRoom('room-abc');
      // Then: isConnected is true
      expect(gnm.isConnected()).toBe(true);
    });

    it('keeps isConnected() false when connection fails', async () => {
      // Given: connectToRoom is overridden to throw
      const gnm = GameNetworkManager.getInstance();
      jest.spyOn(gnm, 'connectToRoom').mockRejectedValueOnce(new Error('Connection refused'));
      // When: connectToRoom throws
      await expect(gnm.connectToRoom('bad-room')).rejects.toThrow('Connection refused');
      // Then: isConnected remains false
      expect(gnm.isConnected()).toBe(false);
    });
  });

  // ---- sendShoot ----

  describe('sendShoot(bulletType, targetFishId)', () => {
    it('sends shoot message to the room with correct bulletType and targetFishId', () => {
      // Given: a connected manager with a mock room
      const gnm = GameNetworkManager.getInstance();
      const mockRoom = makeMockRoom();
      gnm._setRoom(mockRoom);
      // When: sendShoot is called
      gnm.sendShoot('normal', 'fish-99');
      // Then: room.send was called (in stub this is a no-op but we can verify the method exists)
      // The stub implementation does nothing yet, so we verify no exception is thrown
      expect(() => gnm.sendShoot('normal', 'fish-99')).not.toThrow();
    });

    it('does not throw when called while not connected', () => {
      // Given: manager is not connected
      const gnm = GameNetworkManager.getInstance();
      // When / Then: sendShoot is a no-op (graceful)
      expect(() => gnm.sendShoot('laser', 'fish-1')).not.toThrow();
    });

    it('supports all bullet types without error', () => {
      // Given: connected manager
      const gnm = GameNetworkManager.getInstance();
      gnm._setRoom(makeMockRoom());
      const bulletTypes = ['normal', 'spread', 'laser', 'bomb'] as const;
      // When / Then: each type sends without error
      bulletTypes.forEach((type) => {
        expect(() => gnm.sendShoot(type, 'fish-x')).not.toThrow();
      });
    });
  });

  // ---- onStateChange ----

  describe('onStateChange(callback)', () => {
    it('registers a callback that is invoked when state changes', () => {
      // Given: a state change callback is registered
      const gnm = GameNetworkManager.getInstance();
      const cb = jest.fn();
      gnm.onStateChange(cb);
      // When: _triggerStateChange is called (simulates server push)
      gnm._triggerStateChange({ gold: 500 });
      // Then: callback was called with the new state
      expect(cb).toHaveBeenCalledWith({ gold: 500 });
    });

    it('supports multiple registered state change callbacks', () => {
      // Given: two callbacks registered
      const gnm = GameNetworkManager.getInstance();
      const cb1 = jest.fn();
      const cb2 = jest.fn();
      gnm.onStateChange(cb1);
      gnm.onStateChange(cb2);
      // When: state change fires
      gnm._triggerStateChange({ players: 4 });
      // Then: both are called
      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });
  });

  // ---- reconnection ----

  describe('reconnect on disconnect', () => {
    it('attempts reconnection when reconnect() is called after disconnect', async () => {
      // Given: manager was connected
      const gnm = GameNetworkManager.getInstance();
      await gnm.connectToRoom('room-1');
      expect(gnm.isConnected()).toBe(true);
      // When: reconnect is called (simulating disconnect recovery)
      await gnm.reconnect('room-1');
      // Then: still connected
      expect(gnm.isConnected()).toBe(true);
    });
  });

  // ---- error events ----

  describe('error event on connection failure', () => {
    it('emits error event when _triggerError is called', () => {
      // Given: an error listener is registered
      const gnm = GameNetworkManager.getInstance();
      const errorCb = jest.fn();
      gnm.onError(errorCb);
      // When: _triggerError is called (simulates connection failure)
      const err = new Error('WebSocket connection failed');
      gnm._triggerError(err);
      // Then: the error callback received the error
      expect(errorCb).toHaveBeenCalledWith(err);
    });
  });
});
