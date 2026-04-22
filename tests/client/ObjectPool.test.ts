// RED: implementation pending
/**
 * ObjectPoolManager Tests — TDD contract for node pooling in the Cocos Creator client.
 *
 * The pool is framework-agnostic in this test context: we use plain objects
 * that satisfy the PoolableNode interface.
 */

import { ObjectPoolManager, type PrefabLike, type PoolableNode } from '../../src/client/ObjectPoolManager';

/** Create a minimal prefab-like fixture. */
function makePrefab(name: string): PrefabLike {
  return { name };
}

/** Create a minimal node fixture representing a pooled Cocos Creator node. */
function makeNode(name: string): PoolableNode {
  return { name, active: true };
}

describe('ObjectPoolManager', () => {
  let pool: ObjectPoolManager;

  beforeEach(() => {
    ObjectPoolManager.resetInstance();
    pool = new ObjectPoolManager(10); // fresh pool with max=10
  });

  // ---- get() ----

  describe('get(prefab)', () => {
    it('returns a new node when the pool is empty', () => {
      // Given: pool for "fish_small" is empty
      const prefab = makePrefab('fish_small');
      // When: get is called
      const node = pool.get(prefab);
      // Then: a node is returned (not null/undefined)
      expect(node).toBeDefined();
      expect(node.name).toBe('fish_small');
    });

    it('returns an active node when a node is available in the pool', () => {
      // Given: a node has been put back into the pool
      const prefab = makePrefab('fish_big');
      const existing = makeNode('fish_big');
      pool.put('fish_big', existing);
      // When: get is called
      const node = pool.get(prefab);
      // Then: the returned node is active
      expect(node.active).toBe(true);
    });

    it('returns the pooled node (not a new one) after put()', () => {
      // Given: a specific node is pooled
      const prefab = makePrefab('fish_boss');
      const original = makeNode('fish_boss');
      pool.put('fish_boss', original);
      // When: get is called
      const retrieved = pool.get(prefab);
      // Then: it is the exact same object reference
      expect(retrieved).toBe(original);
    });

    it('decreases pool size after a node is retrieved', () => {
      // Given: two nodes are pooled
      const key = 'fish_medium';
      pool.put(key, makeNode(key));
      pool.put(key, makeNode(key));
      expect(pool.getPoolSize(key)).toBe(2);
      // When: get is called once
      pool.get(makePrefab(key));
      // Then: pool size decreases by one
      expect(pool.getPoolSize(key)).toBe(1);
    });
  });

  // ---- put() ----

  describe('put(prefabKey, node)', () => {
    it('returns a node to the pool and increases pool size', () => {
      // Given: an empty pool
      const key = 'fish_small';
      expect(pool.getPoolSize(key)).toBe(0);
      // When: put is called
      pool.put(key, makeNode(key));
      // Then: pool size is 1
      expect(pool.getPoolSize(key)).toBe(1);
    });

    it('deactivates the node when it is returned to the pool', () => {
      // Given: an active node
      const node = makeNode('fish_small');
      expect(node.active).toBe(true);
      // When: put is called
      pool.put('fish_small', node);
      // Then: node is deactivated
      expect(node.active).toBe(false);
    });

    it('discards a node when the pool is at max capacity', () => {
      // Given: a pool with maxSize=2
      const smallPool = new ObjectPoolManager(2);
      const key = 'fish_tiny';
      smallPool.put(key, makeNode(key));
      smallPool.put(key, makeNode(key));
      expect(smallPool.getPoolSize(key)).toBe(2);
      // When: a third node is returned
      smallPool.put(key, makeNode(key));
      // Then: pool stays at max capacity (node discarded)
      expect(smallPool.getPoolSize(key)).toBe(2);
    });
  });

  // ---- clearPool() ----

  describe('clearPool()', () => {
    it('empties all pools', () => {
      // Given: nodes in multiple pools
      pool.put('fish_a', makeNode('fish_a'));
      pool.put('fish_b', makeNode('fish_b'));
      // When: clearPool is called
      pool.clearPool();
      // Then: all pool sizes are 0
      expect(pool.getPoolSize('fish_a')).toBe(0);
      expect(pool.getPoolSize('fish_b')).toBe(0);
    });

    it('allows new nodes to be pooled after clearing', () => {
      // Given: pool is cleared
      const key = 'fish_x';
      pool.put(key, makeNode(key));
      pool.clearPool();
      // When: a new node is added post-clear
      pool.put(key, makeNode(key));
      // Then: pool size is 1
      expect(pool.getPoolSize(key)).toBe(1);
    });
  });

  // ---- max size ----

  describe('max size configuration', () => {
    it('returns the configured max size', () => {
      // Given: pool created with maxSize=10
      // Then: getMaxSize returns 10
      expect(pool.getMaxSize()).toBe(10);
    });

    it('respects updated max size after setMaxSize()', () => {
      // Given: pool with default max
      pool.setMaxSize(5);
      // Then: getMaxSize returns the new value
      expect(pool.getMaxSize()).toBe(5);
    });
  });
});
