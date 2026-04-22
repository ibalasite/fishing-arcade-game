import { NodePool, Prefab, Node, instantiate } from 'cc';

export class ObjectPoolManager {
  private static _instance: ObjectPoolManager | null = null;
  private _pools: Map<string, NodePool> = new Map();
  private _prefabs: Map<string, Prefab> = new Map();

  static getInstance(): ObjectPoolManager {
    if (!ObjectPoolManager._instance) {
      ObjectPoolManager._instance = new ObjectPoolManager();
    }
    return ObjectPoolManager._instance;
  }

  registerPrefab(key: string, prefab: Prefab): void {
    this._prefabs.set(key, prefab);
    if (!this._pools.has(key)) {
      this._pools.set(key, new NodePool());
    }
  }

  get(key: string): Node | null {
    const pool = this._pools.get(key);
    if (!pool) return null;
    if (pool.size() > 0) return pool.get();
    const prefab = this._prefabs.get(key);
    if (!prefab) return null;
    return instantiate(prefab);
  }

  put(key: string, node: Node): void {
    const pool = this._pools.get(key);
    if (!pool) {
      node.destroy();
      return;
    }
    pool.put(node);
  }

  clear(key: string): void {
    this._pools.get(key)?.clear();
  }

  clearAll(): void {
    this._pools.forEach((p) => p.clear());
  }
}
