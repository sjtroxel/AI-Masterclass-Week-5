/**
 * E2E — Mobile Layout (375px viewport)
 *
 * Spec refs:
 *   - phase-10-hardening.md §10.2: "Mobile layout (viewport 375px): 2-column
 *     grid renders; Archivist sidebar is hidden by default"
 *   - UI_UX_SPEC.md: Responsive Behavior table — Mobile (<768px): 2 columns,
 *     sidebar hidden (toggle button)
 *   - PosterGrid: className="columns-2 gap-discovery md:columns-3 lg:columns-4"
 *   - ArchivistSidebar: aria-hidden={!isOpen} — hidden by default (localStorage empty)
 *
 * Selector notes:
 *   - Sidebar aria-hidden="true" hides the element from Playwright's getByRole();
 *     use the CSS locator `aside[aria-label="..."]` instead.
 *   - Multiple "Open The Archivist" buttons exist on search results pages; use .first().
 */
import { test, expect } from '@playwright/test';
import { mockSearchHappyPath } from './mock-api.js';

const SIDEBAR_SELECTOR = 'aside[aria-label="The Archivist — AI research assistant"]';

test.describe('Mobile layout — 375px viewport', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page }) => {
    await mockSearchHappyPath(page);
    await page.goto('/search?q=WPA+labor+poster&mode=text');
    // Wait for results to arrive
    await expect(page.locator('article[role="article"]').first()).toBeVisible();
  });

  test('poster grid renders with 2 columns on mobile', async ({ page }) => {
    // The grid container has Tailwind class "columns-2" at mobile width,
    // which computes to column-count: 2 in CSS.
    const gridContainer = page
      .locator('section[aria-label="Search results"] > div')
      .first();
    await expect(gridContainer).toBeVisible();

    const columnCount = await gridContainer.evaluate(
      (el) => getComputedStyle(el).columnCount,
    );
    expect(columnCount).toBe('2');
  });

  test('Archivist sidebar is hidden by default on mobile (aria-hidden="true")', async ({ page }) => {
    // Fresh context → localStorage empty → isOpen=false → aria-hidden="true".
    // Must use CSS locator — getByRole cannot find aria-hidden elements.
    const sidebar = page.locator(SIDEBAR_SELECTOR);
    await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
  });

  test('Archivist toggle tab is visible on mobile', async ({ page }) => {
    // Two "Open The Archivist" buttons exist (SearchPage toolbar + sidebar tab).
    // At least the first one must be visible.
    const toggleBtns = page.getByRole('button', { name: 'Open The Archivist' });
    await expect(toggleBtns.first()).toBeVisible();
  });

  test('opening Archivist on mobile shows the full-screen drawer', async ({ page }) => {
    await page.getByRole('button', { name: 'Open The Archivist' }).first().click();

    const sidebar = page.locator(SIDEBAR_SELECTOR);
    // aria-hidden must be removed when open
    await expect(sidebar).toHaveAttribute('aria-hidden', 'false');

    // On mobile the sidebar is w-full (full screen drawer)
    const box = await sidebar.boundingBox();
    expect(box).not.toBeNull();
    // Allow ±5px tolerance for subpixel rounding
    expect(box!.width).toBeGreaterThanOrEqual(370);
  });

  test('search bar is visible and full-width on mobile', async ({ page }) => {
    const searchInput = page.getByRole('searchbox', { name: 'Search query' });
    await expect(searchInput).toBeVisible();

    const inputBox = await searchInput.boundingBox();
    expect(inputBox).not.toBeNull();
    // Input fills flex-1 within a flex row that also contains a submit button.
    // At 375px: total width minus button (~48px) minus gaps/padding ≈ 240px+.
    expect(inputBox!.width).toBeGreaterThan(200);
  });
});
