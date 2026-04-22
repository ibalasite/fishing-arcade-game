# Smoke Test Report — STEP-24
Date: 2026-04-23

## Gate Results

| Check | Status | Details |
|-------|--------|---------|
| TypeScript compilation | PASS | 0 errors (fixed 3 issues: BulletState re-export, `onLeave` param type, `@types/jsonwebtoken` missing) |
| Unit tests (165 tests) | PASS | 165/165 passing across 10 test suites |
| Coverage >= 80% | PASS | Stmt: 98.11%, Branch: 94%, Fn: 99.14%, Lines: 98.59% |
| No hardcoded secrets | PASS | 0 violations — 4 files reference env-var key names only |
| package.json scripts | PASS | All 4 required scripts present (test, build, start, dev) |

## Overall Gate: PASS

## Fixes Applied During Smoke Gate

### Fix 1: BulletState Duplicate Export (src/schema/GameState.ts)
- `BulletState` was declared as a top-level `export class` at line 16 **and** re-exported via `export { ... BulletState }` at line 105.
- TS2323 "Cannot redeclare exported variable" / TS2484 "Export declaration conflicts".
- Resolution: Removed `BulletState` from the bottom re-export line (it was already exported by its declaration).

### Fix 2: `onLeave` Parameter Type Mismatch (src/rooms/GameRoom.ts)
- Implementation declared `onLeave(client: Client, code: number)` but Colyseus 0.15 base type declares `onLeave(client: Client, consented?: boolean)`.
- TS2416 "Property 'onLeave' in type 'GameRoom' is not assignable to the same property in base type".
- Resolution: Changed signature to `onLeave(client: Client, consented?: boolean)` and updated the disconnect-intent check from `if (code !== 1000)` to `if (!consented)` — semantically equivalent (false/undefined = unexpected disconnect = allow reconnection).

### Fix 3: Missing `@types/jsonwebtoken` (src/utils/auth.ts)
- `jsonwebtoken` lacked a bundled `.d.ts`; TS7016 "Could not find a declaration file for module 'jsonwebtoken'".
- Resolution: Installed `@types/jsonwebtoken` as a dev dependency (`npm install --save-dev @types/jsonwebtoken`).

## Known Gaps (documented, not blocking)

These are Phase-1 implementation tasks identified in ALIGNMENT-REPORT.md, not defects in the current codebase:

- **GAP-3 (ALIGN-GAP-3)**: `FishSpawner` component not implemented. Fish waves are not auto-spawned. A TODO comment block documents the expected integration point in `GameRoom.ts`. Tracked for Phase-1.
- **GAP-4**: REST API routes (16 endpoints per EDD §2.5) not yet implemented. Express app and `src/api/` directory are absent. Design is complete in EDD.md and API.md. Tracked for Phase-1 implementation sprint.
- **GameNetworkManager.ts branch coverage**: 71.42% branch coverage on the client stub (lines 55-58). This is a client-side module tested in isolation; Colyseus WebSocket branch paths are not exercisable without a live server. Does not affect the 80% global threshold.
