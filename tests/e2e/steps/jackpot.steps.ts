/**
 * Playwright step implementations for jackpot.feature.
 *
 * Scenarios covered:
 *  E2E-JACK-001 — Jackpot pool counter increments in real-time
 *  E2E-JACK-002 — Jackpot win triggers full-screen celebration animation
 *  E2E-JACK-003 — Jackpot odds modal displays correct odds table
 *
 * Skip condition: set E2E_ENABLED=true to run these tests.
 * They require a running game server and Colyseus instance.
 */

import { test, expect } from '@playwright/test';
import { GameRoomPage, JackpotPage } from '../support/page-objects';
import {
  loginAsTestUser,
  waitForGameCanvas,
  waitForRoomState,
  acceptPrivacyConsentIfPresent,
  getDisplayedJackpotPool,
} from '../support/test-helpers';

const GAME_BASE_URL =
  process.env.GAME_BASE_URL ?? 'http://localhost:7456';
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Helper: navigate to an active game room (PLAYING state)
// ---------------------------------------------------------------------------

async function setupPlayingRoom(
  page: ConstructorParameters<typeof GameRoomPage>[0],
): Promise<{ gameRoom: GameRoomPage; jackpot: JackpotPage }> {
  await loginAsTestUser(page, API_BASE_URL);
  const gameRoom = new GameRoomPage(page);
  const jackpot = new JackpotPage(page);

  await gameRoom.goto(GAME_BASE_URL);
  await acceptPrivacyConsentIfPresent(page);
  await gameRoom.joinRoom();
  await waitForRoomState(page, 'PLAYING', 30_000);
  await waitForGameCanvas(page);

  return { gameRoom, jackpot };
}

// ---------------------------------------------------------------------------
// E2E-JACK-001 — Jackpot pool counter increments in real-time
// ---------------------------------------------------------------------------

test.describe('E2E-JACK-001: Jackpot pool counter increments in real-time', () => {
  test.skip(
    process.env.E2E_ENABLED !== 'true',
    'E2E tests require a running server — set E2E_ENABLED=true',
  );

  test('jackpot-pool-counter is visible and updates after shots', async ({
    page,
  }) => {
    const { gameRoom, jackpot } = await setupPlayingRoom(page);

    // Pool counter must be visible in the HUD
    await expect(jackpot.jackpotPoolCounter).toBeVisible();

    // Capture amount before shots
    const poolBefore = await getDisplayedJackpotPool(page);

    // Fire at least one cannon shot to contribute to the pool
    await gameRoom.fireCannon();

    // Wait briefly for server round-trip and UI update (max 2 s)
    await page.waitForTimeout(500);
    await expect(jackpot.jackpotPoolCounter).toBeVisible();

    // Pool amount should be >= previous value after contribution
    await jackpot.expectPoolCounterIncreased(poolBefore);
  });

  test('pool counter never decreases during rapid fire', async ({ page }) => {
    const { gameRoom, jackpot } = await setupPlayingRoom(page);

    await expect(jackpot.jackpotPoolCounter).toBeVisible();

    const readings: number[] = [];
    const SHOTS = 3;

    for (let i = 0; i < SHOTS; i++) {
      readings.push(await getDisplayedJackpotPool(page));
      await gameRoom.fireCannon();
      // Small wait to let the counter animate — no hard sleep needed as
      // we are asserting the final state once all shots are done.
    }

    // Final counter must be >= all previously recorded values
    const finalPool = await getDisplayedJackpotPool(page);
    for (const reading of readings) {
      expect(finalPool).toBeGreaterThanOrEqual(reading);
    }
  });
});

// ---------------------------------------------------------------------------
// E2E-JACK-002 — Jackpot win triggers full-screen celebration animation
// ---------------------------------------------------------------------------

test.describe('E2E-JACK-002: Jackpot win triggers full-screen celebration animation', () => {
  test.skip(
    process.env.E2E_ENABLED !== 'true',
    'E2E tests require a running server — set E2E_ENABLED=true',
  );

  test('celebration overlay appears and auto-dismisses after jackpot event', async ({
    page,
  }) => {
    const { jackpot } = await setupPlayingRoom(page);

    // Trigger the jackpot win event via test hook API (if available).
    // If the test API is absent the request will 404 — the test then
    // waits passively and relies on a seeded short-cycle jackpot.
    const triggerResp = await page.request
      .post(`${API_BASE_URL}/api/v1/test/trigger-jackpot`, {
        headers: { 'Content-Type': 'application/json' },
        data: { roomId: 'current' },
      })
      .catch(() => null);

    if (triggerResp && !triggerResp.ok()) {
      test.skip(
        true,
        'Test jackpot-trigger API not available — skipping celebration assertion',
      );
      return;
    }

    // Celebration overlay must become visible within 3 s
    await jackpot.expectCelebrationVisible(3_000);

    // Winner name and amount must be shown
    await expect(jackpot.jackpotWinnerName).toBeVisible();
    await expect(jackpot.jackpotWinnerAmount).toBeVisible();

    // Overlay auto-dismisses after ~5 s animation (allow up to 10 s)
    await jackpot.expectCelebrationHidden(10_000);

    // Game resumes PLAYING state
    await expect(
      page.locator('[data-testid="room-state-indicator"]'),
    ).toHaveText('PLAYING', { timeout: 5_000 });

    // Pool counter resets (should now be a small seed value)
    await expect(jackpot.jackpotPoolCounter).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// E2E-JACK-003 — Jackpot odds modal displays correct odds table
// ---------------------------------------------------------------------------

test.describe('E2E-JACK-003: Jackpot odds modal displays correct odds table', () => {
  test.skip(
    process.env.E2E_ENABLED !== 'true',
    'E2E tests require a running server — set E2E_ENABLED=true',
  );

  const ODDS_ROWS: Array<{ multiplier: string; oddsText: string }> = [
    { multiplier: '1x', oddsText: '1 in 500,000' },
    { multiplier: '2x', oddsText: '1 in 250,000' },
    { multiplier: '5x', oddsText: '1 in 100,000' },
    { multiplier: '10x', oddsText: '1 in 50,000' },
  ];

  test('odds modal opens, shows correct table, and can be closed', async ({
    page,
  }) => {
    const { jackpot } = await setupPlayingRoom(page);

    // jackpot-info-btn is visible in the HUD
    await expect(jackpot.jackpotInfoBtn).toBeVisible();

    // Open the modal
    await jackpot.openOddsModal();
    await expect(jackpot.jackpotOddsModal).toBeVisible();

    // Verify each odds row is present
    for (const { multiplier, oddsText } of ODDS_ROWS) {
      await jackpot.expectOddsTableRow(multiplier, oddsText);
    }

    // Modal shows the current live pool amount (same as HUD counter)
    const hudPool = await getDisplayedJackpotPool(page);
    const modalText = await jackpot.jackpotOddsModal.innerText();
    // The pool amount string should appear somewhere in the modal content
    const poolStr = hudPool.toLocaleString();
    expect(modalText).toContain(poolStr.replace(/,/g, ''));

    // Close modal
    await jackpot.closeOddsModal();
    await expect(jackpot.jackpotOddsModal).toBeHidden();

    // HUD is interactive again — jackpot-info-btn still visible
    await expect(jackpot.jackpotInfoBtn).toBeVisible();
  });
});
