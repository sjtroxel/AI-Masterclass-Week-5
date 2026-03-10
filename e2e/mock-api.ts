/**
 * Shared Playwright route mocking helpers.
 *
 * Each function intercepts a specific API endpoint and returns a deterministic
 * fixture response. All tests must call the relevant helpers before navigating,
 * so no real network traffic reaches the Express backend.
 *
 * Pattern follows TESTING.md: "E2E tests must never call real Anthropic / Supabase APIs."
 */
import type { Page } from '@playwright/test';
import {
  SEARCH_RESULTS,
  SEARCH_HANDOFF,
  POSTER,
  SIBLINGS,
  CHAT_SSE_BODY,
} from './fixtures.js';

/** The default API base URL as configured in client/src/lib/api.ts. */
const API = 'http://localhost:3001';

// ─── Individual mock setters ──────────────────────────────────────────────────

/** Intercept POST /api/search → happy-path fixture (3 results, no handoff). */
export async function mockSearchHappyPath(page: Page): Promise<void> {
  await page.route(`${API}/api/search`, (route) =>
    route.fulfill({
      status:      200,
      contentType: 'application/json',
      body:        JSON.stringify({ data: SEARCH_RESULTS }),
    }),
  );
}

/** Intercept POST /api/search → handoff fixture (1 low-confidence result). */
export async function mockSearchHandoff(page: Page): Promise<void> {
  await page.route(`${API}/api/search`, (route) =>
    route.fulfill({
      status:      200,
      contentType: 'application/json',
      body:        JSON.stringify({ data: SEARCH_HANDOFF }),
    }),
  );
}

/**
 * Intercept GET /api/posters/:id (non-siblings) → full poster fixture.
 *
 * Uses a URL predicate to avoid catching /siblings requests; must be registered
 * BEFORE mockSiblings so Playwright's LIFO ordering lets siblings win.
 */
export async function mockPoster(page: Page): Promise<void> {
  await page.route(
    (url) =>
      url.href.includes('/api/posters/') &&
      !url.pathname.endsWith('/siblings'),
    (route) =>
      route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify({ data: POSTER }),
      }),
  );
}

/** Intercept GET /api/posters/:id/siblings → siblings fixture. */
export async function mockSiblings(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname.endsWith('/siblings'),
    (route) =>
      route.fulfill({
        status:      200,
        contentType: 'application/json',
        body:        JSON.stringify({ data: SIBLINGS }),
      }),
  );
}

/**
 * Intercept POST /api/chat → deterministic SSE stream.
 *
 * The entire body is sent at once; the fetch-based SSE parser in api.ts
 * processes it correctly because it splits on \n\n regardless of chunk timing.
 */
export async function mockChat(page: Page): Promise<void> {
  await page.route(`${API}/api/chat`, (route) =>
    route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
      body: CHAT_SSE_BODY,
    }),
  );
}

// ─── Convenience: full happy-path setup ───────────────────────────────────────

/**
 * Sets up all API mocks for a standard desktop happy-path scenario.
 * Register siblings before poster so the more-specific siblings pattern wins
 * (Playwright LIFO: last registered = first tried for overlapping predicates).
 */
export async function setupAllMocks(page: Page): Promise<void> {
  await mockSearchHappyPath(page);
  await mockSiblings(page);   // register before mockPoster
  await mockPoster(page);
  await mockChat(page);
}
