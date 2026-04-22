# Test Audit Report — STEP-25
Date: 2026-04-22

## Findings

| File | Test | Issue | Resolution |
|------|------|-------|------------|
| `tests/unit/JackpotManager.test.ts` | `JACKPOT_ODDS — falls back to 1x odds for unknown multipliers` | Comment said "tryTrigger should use JACKPOT_ODDS[1] as fallback" but never verified it — the test body asserted only that `JACKPOT_ODDS[99]` is `undefined`, leaving the comment as an unverified claim | Fixed: added explicit assertion that the fallback value `JACKPOT_ODDS[1]` equals `500_000` |
| `tests/unit/RTPEngine.test.ts` | `_dynamicAdjust — scales down numerator when actual RTP exceeds targetRtpMax` | Assertions were `rtp > 0` and `!NaN` — too loose, trivially true even if the numerator was never actually reduced | Strengthened: after 10,000 more adjudications, asserts that hit count is `< 10_000`, confirming the numerator was reduced from 100% |
| `tests/unit/RTPEngine.test.ts` | `_dynamicAdjust — caps adjusted numerator at denominator-1 when rtp=0 and base numerator is nonzero` | Ended with `expect(() => ...).not.toThrow()` and `expect(...).not.toBeNaN()` — trivially true, verified no actual boosting behavior | Fixed: uses `crypto.randomInt` spy to force roll=0 and asserts `result.hit === true` confirming the numerator was capped at denominator-1 |
| `tests/unit/RTPEngine.test.ts` | `_dynamicAdjust — scales numerator up when RTP < targetRtpMin and base numerator > 0` | Asserted only `currentRtp >= 0` and `!NaN`; used `void engine` to suppress unused variable warning indicating the test was incomplete | Strengthened: added explicit assertion that `rtpZero === 0` for the zero-numerator engine (confirming unkillable-fish guard), and `rtp > 0` for the nonzero engine (confirming some hits occurred) |
| `tests/unit/WalletService.test.ts` | `debitGold — uses mocked db.query (does not call real database)` | Tested only `mockTransaction.toHaveBeenCalledTimes(1)` — tests the mock framework, not the real service logic | Replaced: now asserts that the UPDATE query receives the correct `betAmount` (200) and `userId` ('user-42') as parameters |
| `tests/unit/WalletService.test.ts` | `creditGold — uses mocked db.query (does not call real database)` | Same pattern as above — only verified mock was called once | Replaced: now asserts UPDATE receives correct `amount` (1000) and `userId` ('user-99'), and INSERT also references the user id |
| `tests/client/GameNetworkManager.test.ts` | `sendShoot — sends shoot message to the room with correct bulletType and targetFishId` | Called `sendShoot` once, then immediately called it again inside `expect(() => ...).not.toThrow()` — the mock room's `send` was never asserted | Fixed: asserts `mockRoom.send` was called once with event name `'shoot'` and payload `{ bulletType: 'normal', targetFishId: 'fish-99' }`. This exposed a stub bug in the implementation (see below) |
| `tests/client/GameNetworkManager.test.ts` | `sendShoot — supports all bullet types without error` | Only checked `not.toThrow()` per bullet type but never verified `mockRoom.send` payload | Fixed: asserts `mockRoom.send` called 4 times, once per type, each with the correct `bulletType` in the payload |

## Implementation Fix Triggered by Audit

The strengthened `sendShoot` assertions revealed that `src/client/GameNetworkManager.ts` had a stub implementation:
```typescript
// Before (stub):
const msg: ShootMessage = { bulletType, targetFishId };
void msg; // message was discarded

// After (fixed):
(this._room as { send: (event: string, payload: ShootMessage) => void }).send('shoot', msg);
```

## Summary

- Total tests audited: 165
- Fake tests found: 8
- Fixed (assertions strengthened or implementation corrected): 8
- Stubs (pending implementation): 0
- Tests with strengthened assertions: 7
- Implementation bugs caught by audit: 1 (`GameNetworkManager.sendShoot` was discarding the message instead of calling `room.send`)
- Tests passing after audit: 165
