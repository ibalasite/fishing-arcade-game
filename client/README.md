# Fishing Arcade Game — Cocos Creator 4.x Client

This is the Cocos Creator 4.x client for the Fishing Arcade Game multiplayer project.

## Prerequisites

- **Cocos Creator 4.x** — download and install from [cocos.com](https://www.cocos.com/en/creator)
- **Node.js 18+** — required by the backend server
- The **Colyseus client SDK** (see SDK section below)

## Opening the Project

1. Launch Cocos Creator 4.x
2. On the Dashboard, click **Open Project**
3. Navigate to and select this `client/` folder
4. The editor will import assets and compile scripts automatically

## Start Scene

The project is configured to boot from `Boot.scene` (set in `settings/v2/general.json`).

The boot sequence:
1. `Boot.ts` initialises `DataManager` and `SecureStorage`
2. Checks for privacy consent in local storage
3. Loads `MainMenu` scene

## Scene Overview

| Scene | Purpose |
|-------|---------|
| `Boot.scene` | One-time initialisation, then redirects to MainMenu |
| `MainMenu.scene` | Lobby, jackpot display, navigation to GameRoom / Shop |
| `GameRoom.scene` | Live multiplayer fishing table, Colyseus WebSocket connection |
| `Shop.scene` | In-game shop for cannon upgrades and items |

## Backend Server

The server must be running before `GameRoom` attempts a WebSocket connection.

From the project root (parent of `client/`):

```bash
npm run dev
```

The server listens on `ws://localhost:3000`. The Colyseus room name is `fishing_room`.

The REST endpoint polled by `MainMenu` for the jackpot pool:

```
GET http://localhost:3000/api/v1/game/jackpot/pool
```

## Colyseus Client SDK

The `GameNetworkManager` expects a global `Colyseus` object with a `Client` constructor.
Install the SDK via one of these methods:

**Option A — Cocos Creator Extension (recommended)**

Search for "Colyseus" in the Cocos Store / Extension Manager and install the official plugin.
It bundles `colyseus.js` and exposes it as a global.

**Option B — npm + bundler shim**

```bash
cd client
npm install colyseus.js
```

Then expose it to the global scope in `Boot.ts`:

```typescript
import * as Colyseus from 'colyseus.js';
(globalThis as any).Colyseus = Colyseus;
```

## Script Map

```
assets/scripts/
├── Boot.ts                          Entry point component
├── MainMenu.ts                      Main menu controller
├── GameRoom.ts                      Game scene controller
├── network/
│   └── GameNetworkManager.ts        Colyseus room singleton wrapper
├── cannon/
│   └── CannonController.ts          Touch input → shoot message
├── fish/
│   └── FishController.ts            Cubic Bezier path movement
├── ui/
│   ├── UIManager.ts                 Toast / modal overlay manager
│   ├── HUD.ts                       In-game heads-up display labels
│   └── JackpotDisplay.ts            Animated rolling jackpot counter
└── utils/
    ├── DataManager.ts               Cross-scene key-value store singleton
    ├── SecureStorage.ts             Base64-encoded localStorage wrapper
    └── ObjectPoolManager.ts         Generic Cocos NodePool manager
```

## Asset Directories

| Path | Contents |
|------|---------|
| `assets/prefabs/fish/` | Fish node prefabs (add via Cocos editor) |
| `assets/prefabs/cannon/` | Cannon and bullet prefabs |
| `assets/prefabs/ui/` | UI widget prefabs (toast, modal, etc.) |
| `assets/prefabs/effects/` | Particle and VFX prefabs |
| `assets/textures/atlas/` | Sprite atlas files |
| `assets/textures/bg/` | Background textures |
| `assets/spines/fish/` | Spine skeleton animations for fish |
| `assets/spines/cannon/` | Spine skeleton animations for cannons |
