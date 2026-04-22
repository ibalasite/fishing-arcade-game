/**
 * Playwright configuration for the fishing arcade game E2E tests.
 *
 * Test discovery: all *.steps.ts files inside tests/e2e/steps/
 *
 * Run:
 *   E2E_ENABLED=true npx playwright test --config tests/e2e/playwright.config.ts
 *
 * Environment variables:
 *   E2E_ENABLED      — set to "true" to enable tests (default: skipped)
 *   GAME_BASE_URL    — game client origin (default: http://localhost:7456)
 *   API_BASE_URL     — REST API origin   (default: http://localhost:3000)
 *   WS_BASE_URL      — Colyseus WS URL  (default: ws://localhost:2567)
 *   E2E_TEST_USER    — login username    (default: e2e_test_player)
 *   E2E_TEST_PASS    — login password    (default: E2eTestPass123!)
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './steps',
  testMatch: '**/*.steps.ts',

  // Global timeout per test
  timeout: 60_000,

  // Retry flaky tests once in CI
  retries: process.env.CI ? 1 : 0,

  // Run tests in parallel; keep workers low to avoid exhausting a single
  // local Colyseus instance during development.
  workers: process.env.CI ? 2 : 1,

  use: {
    baseURL:
      process.env.GAME_BASE_URL ?? 'http://localhost:7456',

    // Capture screenshot on failure for debugging
    screenshot: 'only-on-failure',

    // Retain video recording on failure
    video: 'retain-on-failure',

    // Trace on failure for Playwright trace viewer
    trace: 'retain-on-failure',

    // Navigation timeout
    navigationTimeout: 30_000,

    // Default action timeout (clicks, fills, etc.)
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  reporter: [
    ['list'],
    ['html', { outputFolder: '../../playwright-report', open: 'never' }],
    ['junit', { outputFile: '../../playwright-results.xml' }],
  ],

  // Global setup/teardown hooks (create if needed for DB seeding etc.)
  // globalSetup: './support/global-setup.ts',
  // globalTeardown: './support/global-teardown.ts',
});
