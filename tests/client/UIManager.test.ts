// RED: implementation pending
/**
 * UIManager Tests — TDD contract for HUD updates and game effect triggers.
 */

import { UIManager, type LabelLike, type NodeLike } from '../../src/client/UIManager';

/** Create a minimal Label-like fixture. */
function makeLabel(): LabelLike {
  return { string: '' };
}

/** Create a minimal Node-like fixture. */
function makeNode(name: string): NodeLike {
  return {
    name,
    active: false,
    position: { x: 0, y: 0, z: 0 },
    getComponent: jest.fn(() => null),
  };
}

describe('UIManager', () => {
  let ui: UIManager;

  beforeEach(() => {
    UIManager.resetInstance();
    ui = UIManager.getInstance();
  });

  // ---- updateGold ----

  describe('updateGold(amount)', () => {
    it('updates the gold HUD label string to the provided amount', () => {
      // Given: a gold label is registered
      const label = makeLabel();
      ui.setGoldLabel(label);
      // When: updateGold is called with 1000
      ui.updateGold(1000);
      // Then: label.string equals "1000"
      expect(label.string).toBe('1000');
    });

    it('does not throw when the gold label has not been set', () => {
      // Given: no gold label registered
      // When / Then: updateGold is a safe no-op
      expect(() => ui.updateGold(500)).not.toThrow();
    });

    it('updates the label correctly with zero gold', () => {
      // Given: gold label registered and previous value set
      const label = makeLabel();
      label.string = '999';
      ui.setGoldLabel(label);
      // When: updateGold called with 0
      ui.updateGold(0);
      // Then: label.string is "0"
      expect(label.string).toBe('0');
    });
  });

  // ---- updateDiamond ----

  describe('updateDiamond(amount)', () => {
    it('updates the diamond HUD label string to the provided amount', () => {
      // Given: a diamond label is registered
      const label = makeLabel();
      ui.setDiamondLabel(label);
      // When: updateDiamond is called with 50
      ui.updateDiamond(50);
      // Then: label.string equals "50"
      expect(label.string).toBe('50');
    });

    it('does not throw when the diamond label has not been set', () => {
      // Given: no diamond label registered
      // When / Then: updateDiamond is a safe no-op
      expect(() => ui.updateDiamond(25)).not.toThrow();
    });
  });

  // ---- showJackpotAnimation ----

  describe('showJackpotAnimation(amount)', () => {
    it('activates the jackpot node when showJackpotAnimation is called', () => {
      // Given: a jackpot node is registered (initially inactive)
      const jackpotNode = makeNode('JackpotPanel');
      jackpotNode.active = false;
      ui.setJackpotNode(jackpotNode);
      // When: showJackpotAnimation is called with the win amount
      ui.showJackpotAnimation(9999);
      // Then: jackpot node becomes active
      expect(jackpotNode.active).toBe(true);
    });

    it('does not throw when jackpot node has not been set', () => {
      // Given: no jackpot node registered
      // When / Then: showJackpotAnimation is a safe no-op
      expect(() => ui.showJackpotAnimation(5000)).not.toThrow();
    });

    it('triggers jackpot with large jackpot amounts without error', () => {
      // Given: jackpot node registered
      const jackpotNode = makeNode('JackpotPanel');
      ui.setJackpotNode(jackpotNode);
      // When / Then: very large amount does not cause issues
      expect(() => ui.showJackpotAnimation(999_999_999)).not.toThrow();
    });
  });

  // ---- showKillEffect ----

  describe('showKillEffect(fishId)', () => {
    it('does not throw when called for a registered fish node', () => {
      // Given: a fish node is registered
      const fishNode = makeNode('Fish_001');
      ui.registerFishNode('fish-001', fishNode);
      // When: showKillEffect is called
      expect(() => ui.showKillEffect('fish-001')).not.toThrow();
    });

    it('silently logs a warning (does not throw) when fish node is not found', () => {
      // Given: no fish node registered for "ghost-fish"
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      // When: showKillEffect is called for a non-existent fish
      expect(() => ui.showKillEffect('ghost-fish')).not.toThrow();
      // Then: a warning is logged
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('allows fish node to be unregistered after the effect plays', () => {
      // Given: fish is registered
      const fishNode = makeNode('Fish_002');
      ui.registerFishNode('fish-002', fishNode);
      ui.showKillEffect('fish-002');
      // When: unregisterFishNode is called
      ui.unregisterFishNode('fish-002');
      // Then: subsequent showKillEffect logs a warning (not found)
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(() => ui.showKillEffect('fish-002')).not.toThrow();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
