/**
 * Playwright page objects for the fishing arcade game E2E tests.
 *
 * Targets the Cocos Creator 4.x web build served on localhost:7456.
 * All selectors use data-testid attributes to decouple tests from
 * visual/DOM implementation details.
 *
 * Upstream: TEST-PLAN.md §4 E2E Tests
 */

import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

// ---------------------------------------------------------------------------
// Base class
// ---------------------------------------------------------------------------

abstract class BasePage {
  constructor(protected readonly page: Page) {}

  protected locator(testId: string): Locator {
    return this.page.locator(`[data-testid="${testId}"]`);
  }

  async waitForVisible(testId: string, timeoutMs = 10_000): Promise<void> {
    await expect(this.locator(testId)).toBeVisible({ timeout: timeoutMs });
  }

  async waitForHidden(testId: string, timeoutMs = 10_000): Promise<void> {
    await expect(this.locator(testId)).toBeHidden({ timeout: timeoutMs });
  }
}

// ---------------------------------------------------------------------------
// GameRoomPage
// ---------------------------------------------------------------------------

/**
 * Page object for the main game room view.
 * Covers: waiting overlay, game canvas, cannon, room state indicator,
 * gold balance, reconnecting overlay, and shoot result feedback.
 */
export class GameRoomPage extends BasePage {
  // ---- Locators ----

  get joinRoomBtn(): Locator {
    return this.locator('join-room-btn');
  }

  get waitingOverlay(): Locator {
    return this.locator('waiting-overlay');
  }

  get gameCanvas(): Locator {
    return this.locator('game-canvas');
  }

  get roomStateIndicator(): Locator {
    return this.locator('room-state-indicator');
  }

  get goldBalanceDisplay(): Locator {
    return this.locator('gold-balance-display');
  }

  get cannonFireBtn(): Locator {
    return this.locator('cannon-fire-btn');
  }

  get shootResultToast(): Locator {
    return this.locator('shoot-result-toast');
  }

  get payoutAnimation(): Locator {
    return this.locator('payout-animation');
  }

  get reconnectingOverlay(): Locator {
    return this.locator('reconnecting-overlay');
  }

  // ---- Actions ----

  async goto(baseUrl = 'http://localhost:7456'): Promise<void> {
    await this.page.goto(baseUrl);
  }

  async joinRoom(): Promise<void> {
    await expect(this.joinRoomBtn).toBeEnabled();
    await this.joinRoomBtn.click();
  }

  async fireCannon(): Promise<void> {
    await expect(this.cannonFireBtn).toBeEnabled();
    await this.cannonFireBtn.click();
  }

  async goOffline(): Promise<void> {
    await this.page.context().setOffline(true);
  }

  async goOnline(): Promise<void> {
    await this.page.context().setOffline(false);
  }

  // ---- Assertions ----

  async expectRoomState(state: 'WAITING' | 'PLAYING' | 'ENDED'): Promise<void> {
    await expect(this.roomStateIndicator).toHaveText(state);
  }

  async expectGoldBalance(amount: number): Promise<void> {
    await expect(this.goldBalanceDisplay).toHaveText(String(amount));
  }

  async expectShootResultVisible(timeoutMs = 2_000): Promise<void> {
    await expect(this.shootResultToast).toBeVisible({ timeout: timeoutMs });
  }

  async expectReconnectingOverlayVisible(timeoutMs = 3_000): Promise<void> {
    await expect(this.reconnectingOverlay).toBeVisible({ timeout: timeoutMs });
  }

  async expectReconnectingOverlayHidden(timeoutMs = 12_000): Promise<void> {
    await expect(this.reconnectingOverlay).toBeHidden({ timeout: timeoutMs });
  }

  async expectGameRunning(): Promise<void> {
    await expect(this.gameCanvas).toBeVisible();
    await expect(this.roomStateIndicator).toHaveText('PLAYING');
  }
}

// ---------------------------------------------------------------------------
// PrivacyModalPage
// ---------------------------------------------------------------------------

/**
 * Page object for all privacy-related UI flows.
 * Covers: consent modal, settings privacy section, account deletion flow.
 */
export class PrivacyModalPage extends BasePage {
  // ---- Consent modal locators ----

  get privacyConsentModal(): Locator {
    return this.locator('privacy-consent-modal');
  }

  get consentCheckbox(): Locator {
    return this.locator('consent-checkbox');
  }

  get viewPolicyLink(): Locator {
    return this.locator('view-policy-link');
  }

  get policyContent(): Locator {
    return this.locator('policy-content');
  }

  get consentAgreeBtn(): Locator {
    return this.locator('consent-agree-btn');
  }

  get consentDisagreeBtn(): Locator {
    return this.locator('consent-disagree-btn');
  }

  // ---- Settings page locators ----

  get privacySettingsSection(): Locator {
    return this.locator('privacy-settings-section');
  }

  get marketingConsentToggle(): Locator {
    return this.locator('marketing-consent-toggle');
  }

  get revokeConsentConfirmDialog(): Locator {
    return this.locator('revoke-consent-confirm-dialog');
  }

  get consentUpdateSuccessToast(): Locator {
    return this.locator('consent-update-success-toast');
  }

  // ---- Account deletion locators ----

  get deleteAccountBtn(): Locator {
    return this.locator('delete-account-btn');
  }

  get accountDeletionModal(): Locator {
    return this.locator('account-deletion-modal');
  }

  get deletionScheduledDate(): Locator {
    return this.locator('deletion-scheduled-date');
  }

  get confirmDeletionBtn(): Locator {
    return this.locator('confirm-deletion-btn');
  }

  get cancelDeletionBtn(): Locator {
    return this.locator('cancel-deletion-btn');
  }

  get deletionScheduledBanner(): Locator {
    return this.locator('deletion-scheduled-banner');
  }

  get cancelDeletionLink(): Locator {
    return this.locator('cancel-deletion-link');
  }

  get deletionCancelledToast(): Locator {
    return this.locator('deletion-cancelled-toast');
  }

  // ---- Actions ----

  async acceptConsent(): Promise<void> {
    await expect(this.privacyConsentModal).toBeVisible();
    await this.consentAgreeBtn.click();
    await expect(this.privacyConsentModal).toBeHidden();
  }

  async declineConsent(): Promise<void> {
    await expect(this.privacyConsentModal).toBeVisible();
    await this.consentDisagreeBtn.click();
  }

  async viewPrivacyPolicy(): Promise<void> {
    await this.viewPolicyLink.click();
    await expect(this.policyContent).toBeVisible();
  }

  async revokeMarketingConsent(): Promise<void> {
    await this.marketingConsentToggle.click();
    await expect(this.revokeConsentConfirmDialog).toBeVisible();
    await this.page.locator('[data-testid="revoke-consent-confirm-dialog"] [data-testid="confirm-btn"]').click();
    await expect(this.consentUpdateSuccessToast).toBeVisible();
  }

  async requestAccountDeletion(): Promise<void> {
    await this.deleteAccountBtn.click();
    await expect(this.accountDeletionModal).toBeVisible();
    await this.confirmDeletionBtn.click();
    await expect(this.deletionScheduledBanner).toBeVisible();
  }

  async cancelAccountDeletion(): Promise<void> {
    await this.cancelDeletionLink.click();
    await expect(this.deletionCancelledToast).toBeVisible();
    await expect(this.deletionScheduledBanner).toBeHidden();
  }

  // ---- Assertions ----

  async expectConsentModalBlocksJoin(joinRoomBtn: Locator): Promise<void> {
    await expect(this.privacyConsentModal).toBeVisible();
    await expect(joinRoomBtn).toBeDisabled();
  }

  async expectConsentModalHidden(): Promise<void> {
    await expect(this.privacyConsentModal).toBeHidden();
  }
}

// ---------------------------------------------------------------------------
// JackpotPage
// ---------------------------------------------------------------------------

/**
 * Page object for jackpot-related UI.
 * Covers: jackpot pool counter, win celebration overlay, and odds modal.
 */
export class JackpotPage extends BasePage {
  // ---- Locators ----

  get jackpotPoolCounter(): Locator {
    return this.locator('jackpot-pool-counter');
  }

  get jackpotInfoBtn(): Locator {
    return this.locator('jackpot-info-btn');
  }

  get jackpotOddsModal(): Locator {
    return this.locator('jackpot-odds-modal');
  }

  get jackpotOddsTable(): Locator {
    return this.locator('jackpot-odds-table');
  }

  get jackpotOddsCloseBtn(): Locator {
    return this.locator('jackpot-odds-close-btn');
  }

  get jackpotCelebration(): Locator {
    return this.locator('jackpot-celebration');
  }

  get jackpotWinnerName(): Locator {
    return this.locator('jackpot-winner-name');
  }

  get jackpotWinnerAmount(): Locator {
    return this.locator('jackpot-winner-amount');
  }

  // ---- Actions ----

  async openOddsModal(): Promise<void> {
    await this.jackpotInfoBtn.click();
    await expect(this.jackpotOddsModal).toBeVisible();
  }

  async closeOddsModal(): Promise<void> {
    await this.jackpotOddsCloseBtn.click();
    await expect(this.jackpotOddsModal).toBeHidden();
  }

  async getPoolAmount(): Promise<number> {
    const text = await this.jackpotPoolCounter.innerText();
    return parseInt(text.replace(/[^0-9]/g, ''), 10);
  }

  // ---- Assertions ----

  async expectCelebrationVisible(timeoutMs = 3_000): Promise<void> {
    await expect(this.jackpotCelebration).toBeVisible({ timeout: timeoutMs });
  }

  async expectCelebrationHidden(timeoutMs = 10_000): Promise<void> {
    await expect(this.jackpotCelebration).toBeHidden({ timeout: timeoutMs });
  }

  async expectOddsTableRow(multiplier: string, oddsText: string): Promise<void> {
    const row = this.jackpotOddsTable.locator(`tr:has-text("${multiplier}")`);
    await expect(row).toContainText(oddsText);
  }

  async expectPoolCounterIncreased(previousAmount: number): Promise<void> {
    const currentAmount = await this.getPoolAmount();
    expect(currentAmount).toBeGreaterThanOrEqual(previousAmount);
  }
}

// ---------------------------------------------------------------------------
// IapPage
// ---------------------------------------------------------------------------

/**
 * Page object for the IAP (In-App Purchase) shop flow.
 * Covers: product listing, confirmation dialog, success/error toasts.
 */
export class IapPage extends BasePage {
  // ---- Locators ----

  get diamondBalance(): Locator {
    return this.locator('diamond-balance');
  }

  get iapConfirmModal(): Locator {
    return this.locator('iap-confirm-modal');
  }

  get iapConfirmBtn(): Locator {
    return this.locator('iap-confirm-btn');
  }

  get iapCancelBtn(): Locator {
    return this.locator('iap-cancel-btn');
  }

  get iapSuccessToast(): Locator {
    return this.locator('iap-success-toast');
  }

  get iapErrorToast(): Locator {
    return this.locator('iap-error-toast');
  }

  productBtn(productId: string): Locator {
    return this.locator(`iap-product-${productId}`);
  }

  // ---- Actions ----

  async goto(baseUrl = 'http://localhost:7456/shop'): Promise<void> {
    await this.page.goto(baseUrl);
  }

  async startPurchase(productId: string): Promise<void> {
    await this.productBtn(productId).click();
    await expect(this.iapConfirmModal).toBeVisible();
  }

  async confirmPurchase(): Promise<void> {
    await this.iapConfirmBtn.click();
  }

  async cancelPurchase(): Promise<void> {
    await this.iapCancelBtn.click();
    await expect(this.iapConfirmModal).toBeHidden();
  }

  async completePurchase(productId: string, timeoutMs = 5_000): Promise<void> {
    await this.startPurchase(productId);
    await this.confirmPurchase();
    await expect(this.iapSuccessToast).toBeVisible({ timeout: timeoutMs });
  }

  // ---- Assertions ----

  async expectDiamondBalance(amount: number): Promise<void> {
    await expect(this.diamondBalance).toHaveText(String(amount));
  }

  async expectPurchaseError(timeoutMs = 5_000): Promise<void> {
    await expect(this.iapErrorToast).toBeVisible({ timeout: timeoutMs });
    await expect(this.diamondBalance).toHaveText('0');
  }
}
