// RED: implementation pending
/**
 * CannonController Tests — TDD contract for cannon firing logic,
 * rotation, bullet type selection, and rate limiting.
 */

import { CannonController, type ShootEvent } from '../../src/client/CannonController';

describe('CannonController', () => {
  let cannon: CannonController;

  beforeEach(() => {
    jest.useFakeTimers();
    CannonController.resetInstance();
    cannon = CannonController.getInstance();
    cannon.setCooldownMs(500);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ---- fire() ----

  describe('fire(bulletType)', () => {
    it('triggers shoot event with the specified bulletType', () => {
      // Given: a shoot listener is registered
      const listener = jest.fn();
      cannon.onShoot(listener);
      // When: fire is called with 'normal'
      cannon.fire('normal');
      // Then: listener was called with the correct bulletType
      expect(listener).toHaveBeenCalledTimes(1);
      const event: ShootEvent = listener.mock.calls[0][0];
      expect(event.bulletType).toBe('normal');
    });

    it('uses the current bullet type when no argument is passed', () => {
      // Given: current bullet type is 'spread'
      cannon.switchBulletType('spread');
      const listener = jest.fn();
      cannon.onShoot(listener);
      // When: fire is called without an argument
      cannon.fire();
      // Then: shoot event has bulletType 'spread'
      const event: ShootEvent = listener.mock.calls[0][0];
      expect(event.bulletType).toBe('spread');
    });

    it('ignores fire calls while cooling down (rate limit enforcement)', () => {
      // Given: cannon just fired and is cooling down
      const listener = jest.fn();
      cannon.onShoot(listener);
      cannon.fire('normal');
      expect(listener).toHaveBeenCalledTimes(1);
      // When: fire is called again before cooldown expires
      cannon.fire('normal');
      // Then: listener is still only called once
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('allows firing again after the cooldown period expires', () => {
      // Given: cannon fired and cooldown period is 500ms
      const listener = jest.fn();
      cannon.onShoot(listener);
      cannon.fire('normal');
      // When: 500ms elapses
      jest.advanceTimersByTime(500);
      cannon.fire('normal');
      // Then: listener was called twice
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('includes the current angle in the shoot event', () => {
      // Given: cannon is rotated to 90°
      cannon.rotateTo(90);
      const listener = jest.fn();
      cannon.onShoot(listener);
      // When: fire is called
      cannon.fire('normal');
      // Then: shoot event contains angle 90
      const event: ShootEvent = listener.mock.calls[0][0];
      expect(event.angle).toBe(90);
    });
  });

  // ---- rotateTo() ----

  describe('rotateTo(angle)', () => {
    it('sets the cannon rotation to the specified angle', () => {
      // Given: cannon at default angle 0
      // When: rotateTo(45) is called
      cannon.rotateTo(45);
      // Then: a subsequent fire event includes angle 45
      const listener = jest.fn();
      cannon.onShoot(listener);
      cannon.fire();
      const event: ShootEvent = listener.mock.calls[0][0];
      expect(event.angle).toBe(45);
    });

    it('handles negative angles (left rotation)', () => {
      // Given: cannon rotated to -90°
      cannon.rotateTo(-90);
      const listener = jest.fn();
      cannon.onShoot(listener);
      cannon.fire();
      const event: ShootEvent = listener.mock.calls[0][0];
      expect(event.angle).toBe(-90);
    });

    it('handles full 360° rotation', () => {
      // Given: cannon rotated to 360°
      cannon.rotateTo(360);
      const listener = jest.fn();
      cannon.onShoot(listener);
      cannon.fire();
      const event: ShootEvent = listener.mock.calls[0][0];
      expect(event.angle).toBe(360);
    });
  });

  // ---- getCurrentBulletType() ----

  describe('getCurrentBulletType()', () => {
    it('returns "normal" as the default bullet type', () => {
      // Given: freshly created cannon controller
      // Then: default bullet type is 'normal'
      expect(cannon.getCurrentBulletType()).toBe('normal');
    });

    it('returns the newly set type after switchBulletType()', () => {
      // Given: current type is 'normal'
      // When: switchBulletType('laser') is called
      cannon.switchBulletType('laser');
      // Then: getCurrentBulletType returns 'laser'
      expect(cannon.getCurrentBulletType()).toBe('laser');
    });
  });

  // ---- switchBulletType() ----

  describe('switchBulletType(type)', () => {
    it('changes current bullet type to "laser"', () => {
      // Given: default type is 'normal'
      // When: switchBulletType('laser') is called
      cannon.switchBulletType('laser');
      // Then: getCurrentBulletType returns 'laser'
      expect(cannon.getCurrentBulletType()).toBe('laser');
    });

    it('changes current bullet type to "bomb"', () => {
      // Given: any current type
      cannon.switchBulletType('spread');
      // When: switched to 'bomb'
      cannon.switchBulletType('bomb');
      // Then: getCurrentBulletType returns 'bomb'
      expect(cannon.getCurrentBulletType()).toBe('bomb');
    });

    it('fire after switchBulletType uses the new type', () => {
      // Given: switched to 'bomb'
      cannon.switchBulletType('bomb');
      const listener = jest.fn();
      cannon.onShoot(listener);
      // When: fire is called without an argument
      cannon.fire();
      // Then: the shoot event has bulletType 'bomb'
      const event: ShootEvent = listener.mock.calls[0][0];
      expect(event.bulletType).toBe('bomb');
    });
  });
});
