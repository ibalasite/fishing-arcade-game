/**
 * Cocos Creator 4.x mock module for Jest (Node.js environment)
 * Provides stub implementations of all cc.* APIs used in client code.
 */

// ---- Utility stubs ----

export const Vec2 = jest.fn().mockImplementation((x = 0, y = 0) => ({ x, y }));
export const Vec3 = jest.fn().mockImplementation((x = 0, y = 0, z = 0) => ({ x, y, z }));
export const Color = jest.fn().mockImplementation((r = 0, g = 0, b = 0, a = 255) => ({ r, g, b, a }));
export const Rect = jest.fn().mockImplementation((x = 0, y = 0, w = 0, h = 0) => ({ x, y, width: w, height: h }));

// ---- Node mock ----

export class Node {
  name: string;
  active: boolean = true;
  position: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  rotation: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 };
  scale: { x: number; y: number; z: number } = { x: 1, y: 1, z: 1 };
  parent: Node | null = null;
  children: Node[] = [];
  private _components: Map<unknown, unknown> = new Map();

  constructor(name = 'MockNode') {
    this.name = name;
  }

  addComponent = jest.fn((type: unknown) => {
    const instance = typeof type === 'function' ? new (type as new () => unknown)() : {};
    this._components.set(type, instance);
    return instance;
  });

  getComponent = jest.fn((type: unknown) => {
    return this._components.get(type) ?? null;
  });

  getComponentInChildren = jest.fn(() => null);

  setPosition = jest.fn((x: number, y: number, z = 0) => {
    this.position = { x, y, z };
  });

  setRotationFromEuler = jest.fn((x: number, y: number, z: number) => {
    this.rotation = { x, y, z };
  });

  setScale = jest.fn((x: number, y: number, z = 1) => {
    this.scale = { x, y, z };
  });

  on = jest.fn();
  off = jest.fn();
  emit = jest.fn();
  once = jest.fn();
  destroy = jest.fn();
  removeFromParent = jest.fn();
  addChild = jest.fn((child: Node) => {
    this.children.push(child);
    child.parent = this;
  });
}

// ---- Component mock ----

export class Component {
  node: Node = new Node();
  enabled: boolean = true;

  onLoad = jest.fn();
  start = jest.fn();
  update = jest.fn();
  onDestroy = jest.fn();
  onEnable = jest.fn();
  onDisable = jest.fn();
}

// ---- Label mock ----

export class Label extends Component {
  string: string = '';
  fontSize: number = 20;
  overflow: number = 0;
}

// ---- Sprite mock ----

export class Sprite extends Component {
  spriteFrame: unknown = null;
  color: { r: number; g: number; b: number; a: number } = { r: 255, g: 255, b: 255, a: 255 };
}

// ---- Animation mock ----

export class Animation extends Component {
  play = jest.fn();
  stop = jest.fn();
  pause = jest.fn();
  resume = jest.fn();
  getState = jest.fn(() => ({ speed: 1, time: 0 }));
}

// ---- Tween mock ----

export const tween = jest.fn(() => ({
  to: jest.fn().mockReturnThis(),
  by: jest.fn().mockReturnThis(),
  delay: jest.fn().mockReturnThis(),
  call: jest.fn().mockReturnThis(),
  start: jest.fn().mockReturnThis(),
  stop: jest.fn().mockReturnThis(),
  sequence: jest.fn().mockReturnThis(),
  parallel: jest.fn().mockReturnThis(),
  union: jest.fn().mockReturnThis(),
}));

// ---- director mock ----

export const director = {
  loadScene: jest.fn(),
  getScene: jest.fn(() => new Node('Scene')),
  resume: jest.fn(),
  pause: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  getScheduler: jest.fn(() => ({
    schedule: jest.fn(),
    unschedule: jest.fn(),
    scheduleCallbackForTarget: jest.fn(),
  })),
};

// ---- game mock ----

export const game = {
  pause: jest.fn(),
  resume: jest.fn(),
  restart: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  setFrameRate: jest.fn(),
};

// ---- sys mock ----

export const sys = {
  localStorage: {
    _store: {} as Record<string, string>,
    getItem(key: string): string | null {
      return this._store[key] ?? null;
    },
    setItem(key: string, value: string): void {
      this._store[key] = value;
    },
    removeItem(key: string): void {
      delete this._store[key];
    },
    clear(): void {
      this._store = {};
    },
  },
  isNative: false,
  isMobile: false,
  os: 'Unknown',
  platform: 0,
  isBrowser: true,
};

// ---- EventTarget mock ----

export class EventTarget {
  private _listeners: Map<string, Array<(...args: unknown[]) => void>> = new Map();

  on = jest.fn((event: string, cb: (...args: unknown[]) => void) => {
    const list = this._listeners.get(event) ?? [];
    list.push(cb);
    this._listeners.set(event, list);
  });

  off = jest.fn((event: string, cb: (...args: unknown[]) => void) => {
    const list = (this._listeners.get(event) ?? []).filter((l) => l !== cb);
    this._listeners.set(event, list);
  });

  emit = jest.fn((event: string, ...args: unknown[]) => {
    (this._listeners.get(event) ?? []).forEach((cb) => cb(...args));
  });

  once = jest.fn((event: string, cb: (...args: unknown[]) => void) => {
    const wrapper = (...args: unknown[]) => {
      cb(...args);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  });
}

// ---- Prefab mock ----

export class Prefab {
  data: Node = new Node('PrefabRoot');
}

// ---- instantiate mock ----

export const instantiate = jest.fn((prefab: Prefab) => {
  const node = new Node(prefab.data?.name ?? 'InstantiatedNode');
  return node;
});

// ---- resources mock ----

export const resources = {
  load: jest.fn((_path: string, _type: unknown, cb: (err: Error | null, asset: unknown) => void) => {
    cb(null, {});
  }),
  loadDir: jest.fn((_path: string, cb: (err: Error | null, assets: unknown[]) => void) => {
    cb(null, []);
  }),
};

// ---- log helpers ----

export const log = jest.fn((..._args: unknown[]) => undefined);
export const warn = jest.fn((..._args: unknown[]) => undefined);
export const error = jest.fn((..._args: unknown[]) => undefined);

// ---- Decorators (no-ops in test environment) ----

export const ccclass = (_name?: string) => (_target: unknown): void => undefined;
export const property = (_options?: unknown) => (_target: unknown, _key: string): void => undefined;
export const requireComponent = (_type: unknown) => (_target: unknown): void => undefined;
export const disallowMultiple = (_target: unknown): void => undefined;
export const executeInEditMode = (_target: unknown): void => undefined;

// ---- default export (for `import cc from 'cc'` style) ----

const cc = {
  Vec2,
  Vec3,
  Color,
  Rect,
  Node,
  Component,
  Label,
  Sprite,
  Animation,
  tween,
  director,
  game,
  sys,
  EventTarget,
  Prefab,
  instantiate,
  resources,
  log,
  warn,
  error,
  ccclass,
  property,
  requireComponent,
  disallowMultiple,
  executeInEditMode,
};

export default cc;
