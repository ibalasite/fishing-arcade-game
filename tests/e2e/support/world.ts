/**
 * Playwright test world/context for the fishing arcade game E2E tests.
 *
 * Provides a shared browser context and page instance for each test scenario.
 * Game client is a Cocos Creator 4.x web build served on localhost:7456.
 * REST API is served on localhost:3000.
 */

import { Browser, BrowserContext, Page, chromium } from '@playwright/test';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface World {
  browser: Browser;
  page: Page;
  context: BrowserContext;
  baseUrl: string;
  apiUrl: string;
  wsUrl: string;
  authToken: string | null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export async function createWorld(): Promise<World> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  return {
    browser,
    page,
    context,
    baseUrl: process.env.GAME_BASE_URL ?? 'http://localhost:7456',
    apiUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
    wsUrl: process.env.WS_BASE_URL ?? 'ws://localhost:2567',
    authToken: null,
  };
}

export async function destroyWorld(world: World): Promise<void> {
  await world.context.close();
  await world.browser.close();
}
