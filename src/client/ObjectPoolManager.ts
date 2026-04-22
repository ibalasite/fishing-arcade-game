// RED: implementation pending
// This stub exists so test imports resolve. Full implementation is in the client (Cocos Creator) project.

export interface PoolableNode {
  name: string;
  active: boolean;
}

export interface PrefabLike {
  name?: string;
}

/**
 * ObjectPoolManager — generic object pool for Cocos Creator nodes.
 * Reduces GC pressure by reusing pooled nodes.
 */
export class ObjectPoolManager {
  private static _instance: ObjectPoolManager | null = null;

  private _pools: Map<string, PoolableNode[]> = new Map();
  private _maxSize: number;

  constructor(maxSize = 50) {
    this._maxSize = maxSize;
  }

  static getInstance(): ObjectPoolManager {
    if (!ObjectPoolManager._instance) {
      ObjectPoolManager._instance = new ObjectPoolManager();
    }
    return ObjectPoolManager._instance;
  }

  static resetInstance(): void {
    ObjectPoolManager._instance = null;
  }

  setMaxSize(size: number): void {
    this._maxSize = size;
  }

  getMaxSize(): number {
    return this._maxSize;
  }

  /**
   * Get a node from pool for the given prefab key.
   * Creates a new node if pool is empty.
   */
  get(prefab: PrefabLike): PoolableNode {
    const key = prefab.name ?? 'default';
    const pool = this._pools.get(key) ?? [];
    if (pool.length > 0) {
      const node = pool.pop()!;
      node.active = true;
      this._pools.set(key, pool);
      return node;
    }
    // Create new node (in real impl: cc.instantiate(prefab))
    const newNode: PoolableNode = { name: key, active: true };
    return newNode;
  }

  /**
   * Return a node to the pool for the given prefab key.
   * Discards node if pool is at max capacity.
   */
  put(prefabKeyOrName: string, node: PoolableNode): void {
    const pool = this._pools.get(prefabKeyOrName) ?? [];
    if (pool.length >= this._maxSize) {
      // Pool full — let GC collect it
      return;
    }
    node.active = false;
    pool.push(node);
    this._pools.set(prefabKeyOrName, pool);
  }

  /** Returns the number of pooled nodes for a given prefab key. */
  getPoolSize(prefabKey: string): number {
    return (this._pools.get(prefabKey) ?? []).length;
  }

  /** Clears all pools. */
  clearPool(): void {
    this._pools.clear();
  }

  /** Clears pool for a specific prefab key. */
  clearPoolFor(prefabKey: string): void {
    this._pools.delete(prefabKey);
  }
}
