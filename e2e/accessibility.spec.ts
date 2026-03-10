/**
 * E2E — Phase 10.3 Full Accessibility (a11y) Audit
 *
 * Runs axe-core wcag2a + wcag2aa scans against every main route and the
 * Archivist sidebar open state. All API endpoints are intercepted with the
 * shared mock helpers so the audit never touches a live backend.
 *
 * Goal: zero violations across all five surfaces (clean bill of health).
 *
 * Spec refs:
 *   - phase-10-hardening.md §10.3
 *   - WCAG 2.1 AA (axe tags: wcag2a, wcag2aa)
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  mockSearchHappyPath,
  mockSeries,
  mockSiblings,
  mockPoster,
  setupAllMocks,
} from './mock-api.js';
import { POSTER_ID } from './fixtures.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Formats axe violations into a readable string for test failure messages.
 * Groups by impact level so Critical/Serious surface at the top.
 */
function formatViolations(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']): string {
  if (violations.length === 0) return '(none)';
  return violations
    .sort((a, b) => {
      const order = ['critical', 'serious', 'moderate', 'minor'];
      return order.indexOf(a.impact ?? 'minor') - order.indexOf(b.impact ?? 'minor');
    })
    .map((v) => `  [${v.impact?.toUpperCase()}] ${v.id}: ${v.description}\n` +
      v.nodes.slice(0, 2).map((n) => `    → ${n.html.slice(0, 120)}`).join('\n'))
    .join('\n');
}

/** Shared axe scan helper — runs wcag2a + wcag2aa and asserts zero violations. */
async function assertNoViolations(page: import('@playwright/test').Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  expect(
    results.violations,
    `axe violations found:\n${formatViolations(results.violations)}`,
  ).toEqual([]);
}

// ─── Home page ────────────────────────────────────────────────────────────────

test.describe('a11y — Home page (/)', () => {
  test('zero wcag2a/aa violations', async ({ page }) => {
    await page.goto('/');
    // Wait for the hero section to confirm the page has rendered
    await expect(page.locator('main')).toBeVisible();
    await assertNoViolations(page);
  });
});

// ─── Search results page ──────────────────────────────────────────────────────

test.describe('a11y — Search results (/search)', () => {
  test.beforeEach(async ({ page }) => {
    await mockSearchHappyPath(page);
    await page.goto('/search?q=WPA+labor+poster&mode=text');
    // Wait for results grid so axe scans a fully-populated DOM
    await expect(page.locator('article[role="article"]').first()).toBeVisible();
  });

  test('zero wcag2a/aa violations', async ({ page }) => {
    await assertNoViolations(page);
  });
});

// ─── Poster detail page ────────────────────────────────────────────────────────

test.describe('a11y — Poster detail (/poster/:id)', () => {
  test.beforeEach(async ({ page }) => {
    await mockSiblings(page);
    await mockPoster(page);
    await page.goto(`/poster/${POSTER_ID}`);
    // Wait for the poster title to confirm data has loaded
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('zero wcag2a/aa violations', async ({ page }) => {
    await assertNoViolations(page);
  });
});

// ─── Series browse page ────────────────────────────────────────────────────────

test.describe('a11y — Series page (/series/:slug)', () => {
  test.beforeEach(async ({ page }) => {
    await mockSeries(page);
    await page.goto('/series/wpa-posters');
    // Wait for the series heading to confirm data has loaded
    await expect(page.getByRole('heading', { name: 'WPA Posters' })).toBeVisible();
  });

  test('zero wcag2a/aa violations', async ({ page }) => {
    await assertNoViolations(page);
  });
});

// ─── Archivist sidebar — open state ───────────────────────────────────────────

test.describe('a11y — Archivist sidebar (open state)', () => {
  const SIDEBAR = 'aside[aria-label="The Archivist — AI research assistant"]';

  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    await page.goto('/search?q=WPA+labor+poster&mode=text');
    await expect(page.locator('article[role="article"]').first()).toBeVisible();

    // Open the sidebar — use the toolbar button (first of two toggle buttons)
    await page.getByRole('button', { name: 'Open The Archivist' }).first().click();
    await expect(page.locator(SIDEBAR)).toHaveAttribute('aria-hidden', 'false');
  });

  test('zero wcag2a/aa violations with sidebar open', async ({ page }) => {
    await assertNoViolations(page);
  });

  test('zero wcag2a/aa violations after a message is sent', async ({ page }) => {
    const textarea = page.getByRole('textbox', { name: 'Message to The Archivist' });
    await textarea.fill('Tell me about the WPA labor poster');
    await page.getByRole('button', { name: 'Send message' }).click();

    // Wait for streaming response to complete (citation link appears)
    await expect(page.getByRole('link', { name: /NAID-\d+/ })).toBeVisible({ timeout: 8_000 });

    await assertNoViolations(page);
  });
});
