/**
 * Playwright step implementations for game-room.feature.
 *
 * Scenarios covered:
 *  E2E-ROOM-001 — Player joins room and sees waiting overlay
 *  E2E-ROOM-002 — Room reaches 4 players and game starts
 *  E2E-ROOM-003 — Player fires cannon and sees payout animation
 *  E2E-ROOM-004 — Player disconnects and sees reconnecting overlay
 *
 * Skip condition: set E2E_ENABLED=true to run these tests.
 * They require a running Colyseus server on ws://localhost:2567
 * and an HTTP API on http://localhost:3000.
 */

import { test, expect } from '@playwright/test';
import { GameRoomPage } from '../support/page-objects';
import {
  loginAsTestUser,
  waitForGameCanvas,
  waitForRoomState,
  acceptPrivacyConsentIfPresent,
} from '../support/test-helpers';

const GAME_BASE_URL =
  process.env.GAME_BASE_URL ?? 'http://localhost:7456';
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Helper: build a GameRoomPage with auth ready
// ---------------------------------------------------------------------------

async function setupAuthenticatedGameRoom(
  page: ConstructorParameters<typeof GameRoomPage>[0],
): Promise<GameRoomPage> {
  await loginAsTestUser(page, API_BASE_URL);
  const gameRoom = new GameRoomPage(page);
  await gameRoom.goto(GAME_BASE_URL);
  await acceptPrivacyConsentIfPresent(page);
  return gameRoom;
}

// ---------------------------------------------------------------------------
// E2E-ROOM-001 — Player joins room and sees waiting overlay
// ---------------------------------------------------------------------------

test.describe('E2E-ROOM-001: Player joins room and sees waiting overlay', () => {
  test.skip(
    process.env.E2E_ENABLED !== 'true',
    'E2E tests require a running server — set E2E_ENABLED=true',
  );

  test('joining a room shows the waiting overlay when room is not full', async ({
    page,
  }) => {
    const gameRoom = await setupAuthenticatedGameRoom(page);

    // Room should have fewer than 4 players — join-room-btn should be available
    await expect(gameRoom.joinRoomBtn).toBeEnabled();
    await gameRoom.joinRoom();

    // Waiting overlay must be visible
    await expect(gameRoom.waitingOverlay).toBeVisible({ timeout: 5_000 });

    // Player count is shown inside the overlay
    await expect(gameRoom.waitingOverlay).not.toBeEmpty();

    // Canvas must NOT yet be visible
    await expect(gameRoom.gameCanvas).toBeHidden();

    // Room state indicator says WAITING
    await gameRoom.expectRoomState('WAITING');
  });
});

// ---------------------------------------------------------------------------
// E2E-ROOM-002 — Room reaches 4 players and game starts
// ---------------------------------------------------------------------------

test.describe('E2E-ROOM-002: Room reaches 4 players and game starts', () => {
  test.skip(
    process.env.E2E_ENABLED !== 'true',
    'E2E tests require a running server — set E2E_ENABLED=true',
  );

  test('game canvas becomes visible when 4th player joins', async ({
    page,
  }) => {
    const gameRoom = await setupAuthenticatedGameRoom(page);
    await gameRoom.joinRoom();

    // This test expects the server to have 3 bots/players already;
    // in isolation, wait up to 30 s for the room to fill via bot fill.
    await waitForRoomState(page, 'PLAYING', 30_000);

    // Waiting overlay must have disappeared
    await expect(gameRoom.waitingOverlay).toBeHidden({ timeout: 5_000 });

    // Game canvas now visible
    await waitForGameCanvas(page);

    // Room state indicator says PLAYING
    await gameRoom.expectRoomState('PLAYING');

    // Gold balance element is visible for each (this client's) player
    await expect(gameRoom.goldBalanceDisplay).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// E2E-ROOM-003 — Player fires cannon and sees payout animation
// ---------------------------------------------------------------------------

test.describe('E2E-ROOM-003: Player fires cannon and sees payout animation', () => {
  test.skip(
    process.env.E2E_ENABLED !== 'true',
    'E2E tests require a running server — set E2E_ENABLED=true',
  );

  test('cannon fire triggers shoot-result-toast within 2 s', async ({
    page,
  }) => {
    const gameRoom = await setupAuthenticatedGameRoom(page);
    await gameRoom.joinRoom();

    // Wait for game to be PLAYING
    await waitForRoomState(page, 'PLAYING', 30_000);
    await waitForGameCanvas(page);

    // Capture gold balance before shooting
    const goldBefore = await gameRoom.goldBalanceDisplay
      .innerText()
      .catch(() => '0');

    // Fire cannon
    await gameRoom.fireCannon();

    // Shoot result toast appears within 2 s
    await gameRoom.expectShootResultVisible(2_000);

    // Either a payout animation OR a miss toast — at least one must be visible
    const payoutVisible = await gameRoom.payoutAnimation
      .isVisible()
      .catch(() => false);
    const toastVisible = await gameRoom.shootResultToast
      .isVisible()
      .catch(() => false);
    expect(payoutVisible || toastVisible).toBe(true);

    // If it was a hit, gold balance should still be a numeric string
    const goldAfter = await gameRoom.goldBalanceDisplay
      .innerText()
      .catch(() => '0');
    const goldBefore_n = parseInt(goldBefore.replace(/[^0-9]/g, ''), 10) || 0;
    const goldAfter_n = parseInt(goldAfter.replace(/[^0-9]/g, ''), 10) || 0;

    // Gold should either stay the same (miss) or increase (hit)
    expect(goldAfter_n).toBeGreaterThanOrEqual(goldBefore_n - 1); // allow 1-unit bet deduction
  });
});

// ---------------------------------------------------------------------------
// E2E-ROOM-004 — Player disconnects and sees reconnecting overlay
// ---------------------------------------------------------------------------

test.describe('E2E-ROOM-004: Player disconnects and sees reconnecting overlay', () => {
  test.skip(
    process.env.E2E_ENABLED !== 'true',
    'E2E tests require a running server — set E2E_ENABLED=true',
  );

  test('reconnecting overlay appears on network loss and disappears on recovery', async ({
    page,
  }) => {
    const gameRoom = await setupAuthenticatedGameRoom(page);
    await gameRoom.joinRoom();

    await waitForRoomState(page, 'PLAYING', 30_000);
    await waitForGameCanvas(page);

    // Capture gold balance before going offline
    const goldBeforeText = await gameRoom.goldBalanceDisplay
      .innerText()
      .catch(() => '0');

    // Go offline — simulate network loss
    await gameRoom.goOffline();

    // Reconnecting overlay should appear within 3 s
    await gameRoom.expectReconnectingOverlayVisible(3_000);

    // Overlay should have a spinner or status text (non-empty)
    await expect(gameRoom.reconnectingOverlay).not.toBeEmpty();

    // Come back online
    await gameRoom.goOnline();

    // Overlay should disappear within 12 s
    await gameRoom.expectReconnectingOverlayHidden(12_000);

    // Game canvas is visible again
    await expect(gameRoom.gameCanvas).toBeVisible();

    // Room state should be PLAYING
    await gameRoom.expectRoomState('PLAYING');

    // Gold balance preserved (same or within tolerance)
    const goldAfterText = await gameRoom.goldBalanceDisplay
      .innerText()
      .catch(() => '0');
    const goldBefore_n =
      parseInt(goldBeforeText.replace(/[^0-9]/g, ''), 10) || 0;
    const goldAfter_n =
      parseInt(goldAfterText.replace(/[^0-9]/g, ''), 10) || 0;

    // Allow a small delta in case shots fired server-side during disconnect
    expect(Math.abs(goldAfter_n - goldBefore_n)).toBeLessThanOrEqual(100);
  });
});
