/**
 * Playwright step implementations for privacy.feature.
 *
 * Scenarios covered:
 *  E2E-PRIV-001 — Privacy consent modal blocks game start until accepted
 *  E2E-PRIV-002 — User revokes marketing consent in settings
 *  E2E-PRIV-003 — Account deletion flow shows 30-day countdown
 *
 * Skip condition: set E2E_ENABLED=true to run these tests.
 * They require the game HTTP server on localhost:7456 and REST API on localhost:3000.
 */

import { test, expect } from '@playwright/test';
import { GameRoomPage, PrivacyModalPage } from '../support/page-objects';
import {
  registerAndLogin,
  loginAsTestUser,
  verifyDeletionCancelled,
} from '../support/test-helpers';

const GAME_BASE_URL =
  process.env.GAME_BASE_URL ?? 'http://localhost:7456';
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// E2E-PRIV-001 — Privacy consent modal blocks game start until accepted
// ---------------------------------------------------------------------------

test.describe('E2E-PRIV-001: Privacy consent modal blocks game start until accepted', () => {
  test.skip(
    process.env.E2E_ENABLED !== 'true',
    'E2E tests require a running server — set E2E_ENABLED=true',
  );

  test('fresh player sees consent modal that blocks join-room-btn', async ({
    page,
  }) => {
    // Register a brand-new player so no prior consent record exists
    await registerAndLogin(page, API_BASE_URL, 'fresh_priv');

    await page.goto(`${GAME_BASE_URL}`);

    const privacy = new PrivacyModalPage(page);
    const gameRoom = new GameRoomPage(page);

    // Modal must be visible immediately
    await expect(privacy.privacyConsentModal).toBeVisible({ timeout: 10_000 });

    // join-room-btn is disabled while consent is pending
    await privacy.expectConsentModalBlocksJoin(gameRoom.joinRoomBtn);

    // Privacy policy summary text is present
    await expect(privacy.privacyConsentModal).not.toBeEmpty();

    // Both agree and disagree buttons are present
    await expect(privacy.consentAgreeBtn).toBeVisible();
    await expect(privacy.consentDisagreeBtn).toBeVisible();

    // Clicking "view-policy-link" expands full policy text
    await privacy.viewPrivacyPolicy();
    await expect(privacy.policyContent).toBeVisible();

    // Clicking "disagree" leaves modal open and button disabled
    await privacy.declineConsent();
    await expect(privacy.privacyConsentModal).toBeVisible();
    await expect(gameRoom.joinRoomBtn).toBeDisabled();

    // Clicking "agree" hides modal and enables join-room-btn
    await privacy.acceptConsent();
    await expect(privacy.privacyConsentModal).toBeHidden();
    await expect(gameRoom.joinRoomBtn).toBeEnabled();
  });
});

// ---------------------------------------------------------------------------
// E2E-PRIV-002 — User revokes marketing consent in settings
// ---------------------------------------------------------------------------

test.describe('E2E-PRIV-002: User revokes marketing consent in settings', () => {
  test.skip(
    process.env.E2E_ENABLED !== 'true',
    'E2E tests require a running server — set E2E_ENABLED=true',
  );

  test('marketing consent can be revoked from the settings page', async ({
    page,
  }) => {
    // Login as existing test user who has previously granted marketing consent
    await loginAsTestUser(page, API_BASE_URL);

    // Navigate to settings page
    await page.goto(`${GAME_BASE_URL}/settings`);

    const privacy = new PrivacyModalPage(page);

    // Privacy settings section is visible
    await expect(privacy.privacySettingsSection).toBeVisible({ timeout: 10_000 });

    // marketing-consent-toggle is visible and shows "enabled"
    await expect(privacy.marketingConsentToggle).toBeVisible();
    // The toggle's aria-checked or data-state attribute indicates enabled
    const toggleState = await privacy.marketingConsentToggle
      .getAttribute('aria-checked')
      .catch(() => null);
    // Accept both 'true' string and 'enabled' — implementation may vary
    const isEnabled =
      toggleState === 'true' ||
      (await privacy.marketingConsentToggle.innerText()
        .then((t) => t.toLowerCase().includes('enable'))
        .catch(() => false));
    expect(isEnabled).toBe(true);

    // Click toggle to revoke consent
    await privacy.marketingConsentToggle.click();

    // Confirmation dialog appears
    await expect(privacy.revokeConsentConfirmDialog).toBeVisible({ timeout: 5_000 });

    // Confirm the revocation
    await page
      .locator(
        '[data-testid="revoke-consent-confirm-dialog"] [data-testid="confirm-btn"]',
      )
      .click();

    // Toggle updates to show disabled
    await expect(privacy.marketingConsentToggle).toBeVisible();
    const updatedState = await privacy.marketingConsentToggle
      .getAttribute('aria-checked')
      .catch(() => null);
    const isDisabled =
      updatedState === 'false' ||
      (await privacy.marketingConsentToggle.innerText()
        .then((t) => t.toLowerCase().includes('disabl'))
        .catch(() => false));
    expect(isDisabled).toBe(true);

    // Success toast appears
    await expect(privacy.consentUpdateSuccessToast).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// E2E-PRIV-003 — Account deletion flow shows 30-day countdown
// ---------------------------------------------------------------------------

test.describe('E2E-PRIV-003: Account deletion flow shows 30-day countdown', () => {
  test.skip(
    process.env.E2E_ENABLED !== 'true',
    'E2E tests require a running server — set E2E_ENABLED=true',
  );

  test('deletion scheduled banner appears with 30-day countdown and can be cancelled', async ({
    page,
  }) => {
    const token = await registerAndLogin(page, API_BASE_URL, 'del_flow');

    // Navigate to account settings
    await page.goto(`${GAME_BASE_URL}/settings/account`);

    const privacy = new PrivacyModalPage(page);

    // Click the delete-account-btn
    await expect(privacy.deleteAccountBtn).toBeVisible({ timeout: 10_000 });
    await privacy.deleteAccountBtn.click();

    // Account deletion modal appears
    await expect(privacy.accountDeletionModal).toBeVisible({ timeout: 5_000 });

    // Modal explains 30-day grace period
    const modalText = await privacy.accountDeletionModal.innerText();
    expect(modalText.toLowerCase()).toMatch(/30/);

    // Scheduled deletion date is shown
    await expect(privacy.deletionScheduledDate).toBeVisible();

    // Both confirm and cancel buttons are present
    await expect(privacy.confirmDeletionBtn).toBeVisible();
    await expect(privacy.cancelDeletionBtn).toBeVisible();

    // Confirm deletion
    await privacy.confirmDeletionBtn.click();

    // Modal closes
    await expect(privacy.accountDeletionModal).toBeHidden({ timeout: 5_000 });

    // Deletion-scheduled-banner appears in account settings
    await expect(privacy.deletionScheduledBanner).toBeVisible({ timeout: 5_000 });

    // Banner shows 30-day countdown timer
    const bannerText = await privacy.deletionScheduledBanner.innerText();
    expect(bannerText.toLowerCase()).toMatch(/day|countdown|30/);

    // cancel-deletion-link is inside the banner
    await expect(privacy.cancelDeletionLink).toBeVisible();

    // Cancel deletion within the 30-day window
    await privacy.cancelDeletionLink.click();

    // Banner disappears
    await expect(privacy.deletionScheduledBanner).toBeHidden({ timeout: 5_000 });

    // Cancellation toast appears
    await expect(privacy.deletionCancelledToast).toBeVisible({ timeout: 5_000 });

    // Verify via API that the account is still active (no deletion scheduled)
    const cancelled = await verifyDeletionCancelled(page, API_BASE_URL, token);
    expect(cancelled).toBe(true);
  });
});
