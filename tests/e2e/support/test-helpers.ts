/**
 * Reusable E2E test helpers for the fishing arcade game.
 *
 * All helpers are resilient to timing: they use Playwright's built-in
 * waitForSelector / expect rather than arbitrary sleeps.
 */

import { Page, expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

export interface LoginCredentials {
  username: string;
  password: string;
}

const DEFAULT_CREDENTIALS: LoginCredentials = {
  username: process.env.E2E_TEST_USER ?? 'e2e_test_player',
  password: process.env.E2E_TEST_PASS ?? 'E2eTestPass123!',
};

/**
 * Authenticate via the REST API and return the JWT token.
 * Stores the token in localStorage so the game client picks it up.
 */
export async function loginAsTestUser(
  page: Page,
  baseUrl: string,
  credentials: LoginCredentials = DEFAULT_CREDENTIALS,
): Promise<string> {
  const response = await page.request.post(`${baseUrl}/api/v1/auth/login`, {
    data: credentials,
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok()) {
    throw new Error(
      `Login failed: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as { data?: { token?: string } };
  const token = body?.data?.token;

  if (!token) {
    throw new Error('Login response did not contain a token');
  }

  // Inject token so client-side code finds it in localStorage.
  await page.evaluate((jwt: string) => {
    localStorage.setItem('auth_token', jwt);
  }, token);

  return token;
}

/**
 * Register a fresh throwaway player and return its JWT token.
 * Generates a unique suffix to avoid username collisions across test runs.
 */
export async function registerAndLogin(
  page: Page,
  baseUrl: string,
  nickname: string,
): Promise<string> {
  const suffix = Date.now().toString(36);
  const username = `e2e_${nickname}_${suffix}`;

  const regResponse = await page.request.post(
    `${baseUrl}/api/v1/auth/register`,
    {
      data: { username, password: 'E2eTestPass123!', nickname },
      headers: { 'Content-Type': 'application/json' },
    },
  );

  if (!regResponse.ok()) {
    throw new Error(
      `Registration failed: ${regResponse.status()} ${await regResponse.text()}`,
    );
  }

  return loginAsTestUser(page, baseUrl, {
    username,
    password: 'E2eTestPass123!',
  });
}

// ---------------------------------------------------------------------------
// Game canvas helpers
// ---------------------------------------------------------------------------

/**
 * Wait for the game canvas to become visible and be ready for interaction.
 */
export async function waitForGameCanvas(
  page: Page,
  timeoutMs = 15_000,
): Promise<void> {
  await expect(page.locator('[data-testid="game-canvas"]')).toBeVisible({
    timeout: timeoutMs,
  });
}

/**
 * Wait for the game to enter a specific room state.
 */
export async function waitForRoomState(
  page: Page,
  state: 'WAITING' | 'PLAYING' | 'ENDED',
  timeoutMs = 15_000,
): Promise<void> {
  await expect(page.locator('[data-testid="room-state-indicator"]')).toHaveText(
    state,
    { timeout: timeoutMs },
  );
}

// ---------------------------------------------------------------------------
// Jackpot helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the current jackpot pool amount via the REST API.
 * Returns 0 when the server is unavailable (resilient read).
 */
export async function getJackpotPool(
  page: Page,
  apiUrl: string,
): Promise<number> {
  try {
    const response = await page.request.get(
      `${apiUrl}/api/v1/game/jackpot/pool`,
    );
    if (!response.ok()) {
      return 0;
    }
    const body = (await response.json()) as {
      data?: { pool?: number; amount?: number };
    };
    return body?.data?.pool ?? body?.data?.amount ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Read the jackpot pool counter shown in the HUD.
 * Strips any non-numeric characters (currency symbols, commas).
 */
export async function getDisplayedJackpotPool(page: Page): Promise<number> {
  const text = await page
    .locator('[data-testid="jackpot-pool-counter"]')
    .innerText();
  return parseInt(text.replace(/[^0-9]/g, ''), 10);
}

// ---------------------------------------------------------------------------
// Privacy / PDPA helpers
// ---------------------------------------------------------------------------

/**
 * Accept the privacy consent modal if it is present on screen.
 * No-op when the modal is already hidden (i.e., consent was previously given).
 */
export async function acceptPrivacyConsentIfPresent(
  page: Page,
  timeoutMs = 5_000,
): Promise<void> {
  const modal = page.locator('[data-testid="privacy-consent-modal"]');
  const visible = await modal.isVisible().catch(() => false);

  if (visible) {
    await page.locator('[data-testid="consent-agree-btn"]').click();
    await expect(modal).toBeHidden({ timeout: timeoutMs });
  }
}

/**
 * Trigger account deletion via the UI (clicks through the full modal flow).
 */
export async function requestDeletion(page: Page): Promise<void> {
  await page.locator('[data-testid="delete-account-btn"]').click();
  await expect(
    page.locator('[data-testid="account-deletion-modal"]'),
  ).toBeVisible();
  await page.locator('[data-testid="confirm-deletion-btn"]').click();
}

/**
 * Verify via the API that a player's deletion was cancelled.
 */
export async function verifyDeletionCancelled(
  page: Page,
  apiUrl: string,
  token: string,
): Promise<boolean> {
  try {
    const response = await page.request.get(
      `${apiUrl}/api/v1/privacy/deletion-status`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!response.ok()) {
      return false;
    }
    const body = (await response.json()) as {
      data?: { status?: string; scheduled?: boolean };
    };
    const status = body?.data?.status;
    return status === 'none' || status === 'cancelled';
  } catch {
    return false;
  }
}
