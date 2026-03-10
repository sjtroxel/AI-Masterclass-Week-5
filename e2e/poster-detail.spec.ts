/**
 * E2E — Poster Detail Page
 *
 * Spec refs:
 *   - phase-10-hardening.md §10.2: "Click a poster card → navigates to
 *     /poster/:id → metadata renders → Visual Siblings load"
 *   - UI_UX_SPEC.md: PosterDetail layout — title (serif), creator/date/series,
 *     description, subject tags, NARA record, ConfidenceIndicator, VisualSiblings strip
 *
 * Selector notes:
 *   - `getByRole('link', { name: 'labor', exact: true })`: exact needed because
 *     Playwright's accessible-name matching (case-insensitive) also matches the
 *     "Open in NARA" link whose aria-label contains the word "Labor".
 *   - "How are these related?" button: visible text is "How are these related?"
 *     but aria-label is "Ask the Archivist how '...' is related" — use getByText.
 */
import { test, expect } from '@playwright/test';
import { setupAllMocks } from './mock-api.js';
import { POSTER_ID } from './fixtures.js';

const SIDEBAR_SELECTOR = 'aside[aria-label="The Archivist — AI research assistant"]';

test.describe('Poster detail page', () => {
  test.beforeEach(async ({ page }) => {
    // setupAllMocks registers siblings before poster (LIFO — siblings win)
    await setupAllMocks(page);
  });

  test('clicking a poster card navigates to /poster/:id', async ({ page }) => {
    await page.goto('/search?q=WPA+labor+poster&mode=text');

    // Wait for the first PosterCard to appear, then click it
    const firstCard = page.locator('article[role="article"]').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();

    // URL must have changed to the detail route
    await expect(page).toHaveURL(new RegExp(`/poster/${POSTER_ID}`));
  });

  test('metadata renders on /poster/:id', async ({ page }) => {
    await page.goto(`/poster/${POSTER_ID}`);

    // Title must appear in the <h1>
    await expect(
      page.getByRole('heading', { name: 'Work Pays America — WPA Labor Poster' }),
    ).toBeVisible();

    // Creator / date / series line — rendered as one paragraph element
    await expect(
      page.getByText(/Federal Art Project/),
    ).toBeVisible();
    // Scope to <p> to avoid matching the breadcrumb <span> which also contains "WPA Posters"
    await expect(
      page.locator('p').filter({ hasText: /WPA Posters/ }).first(),
    ).toBeVisible();

    // NARA record
    await expect(page.getByText('NAID-516179')).toBeVisible();

    // Description
    await expect(page.getByText(/New Deal era/)).toBeVisible();
  });

  test('subject-tag pills render and link to search', async ({ page }) => {
    await page.goto(`/poster/${POSTER_ID}`);

    // exact: true prevents matching "Open in NARA" link whose aria-label
    // contains "Labor" (case-insensitive accessible-name match).
    const laborTag = page.getByRole('link', { name: 'labor', exact: true });
    await expect(laborTag).toBeVisible();
    const href = await laborTag.getAttribute('href');
    expect(href).toContain('/search?q=labor');
  });

  test('confidence indicator renders with role="meter"', async ({ page }) => {
    await page.goto(`/poster/${POSTER_ID}`);

    const meter = page.locator('progress[role="meter"]');
    await expect(meter.first()).toBeVisible();
    // overall_confidence=0.91 → 91% → aria-valuenow="91"
    await expect(meter.first()).toHaveAttribute('aria-valuenow', '91');
  });

  test('Visual Siblings strip renders sibling thumbnails', async ({ page }) => {
    await page.goto(`/poster/${POSTER_ID}`);

    // Section is labeled per VisualSiblings component
    const siblings = page.getByRole('list', { name: 'Visually similar posters' });
    await expect(siblings).toBeVisible();

    // Both fixture siblings should appear as navigation links
    await expect(
      page.getByRole('link', { name: /Build for Defense/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /America's Answer/ }),
    ).toBeVisible();
  });

  test('"How are these related?" button opens the Archivist sidebar', async ({ page }) => {
    await page.goto(`/poster/${POSTER_ID}`);

    // Wait for Visual Siblings to load
    await expect(
      page.getByRole('list', { name: 'Visually similar posters' }),
    ).toBeVisible();

    // Use visible text — aria-label is "Ask the Archivist how '...' is related"
    // which doesn't match the regex; getByText targets the visible label directly.
    const howRelatedBtn = page.getByText('How are these related?').first();
    await expect(howRelatedBtn).toBeVisible();
    await howRelatedBtn.click();

    // Archivist sidebar should now be open
    const sidebar = page.locator(SIDEBAR_SELECTOR);
    await expect(sidebar).toHaveAttribute('aria-hidden', 'false');
  });
});
