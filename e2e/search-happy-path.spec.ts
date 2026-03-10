/**
 * E2E — Search Happy Path
 *
 * Spec refs:
 *   - phase-10-hardening.md §10.2: "Text search returns results; at least one
 *     result renders a confidence badge"
 *   - UI_UX_SPEC.md: PosterGrid — similarity score badge shown on search results;
 *     ConfidenceIndicator — role="meter", aria-valuenow
 *
 * Includes a basic axe-core accessibility scan per user request (full axe
 * sweep is Phase 10.3; this is a smoke check for the happy-path route only).
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockSearchHappyPath } from './mock-api.js';

test.describe('Search — happy path', () => {
  test.beforeEach(async ({ page }) => {
    await mockSearchHappyPath(page);
    // useSearch auto-fires when the URL has ?q=
    await page.goto('/search?q=WPA+labor+poster&mode=text');
  });

  test('results grid renders with poster cards', async ({ page }) => {
    // Wait for at least one PosterCard (role="article") to appear
    const cards = page.locator('article[role="article"]');
    await expect(cards.first()).toBeVisible();
    await expect(cards).toHaveCount(3);
  });

  test('confidence badges render on search result cards', async ({ page }) => {
    // ConfidenceIndicator uses <progress role="meter"> per UI_UX_SPEC.md
    const meters = page.locator('progress[role="meter"]');
    await expect(meters.first()).toBeVisible();
    // At least one meter must carry aria-valuenow (spec: aria-valuenow required)
    const firstMeter = meters.first();
    await expect(firstMeter).toHaveAttribute('aria-valuenow');
  });

  test('first result card title is visible', async ({ page }) => {
    await expect(
      page.getByText('Work Pays America — WPA Labor Poster'),
    ).toBeVisible();
  });

  test('HandoffBanner is NOT shown when human_handoff_needed=false', async ({ page }) => {
    // The banner has role="alert" with its specific aria-label
    const banner = page.locator(
      '[role="alert"][aria-label="Low-confidence results — expert review available"]',
    );
    await expect(banner).toHaveCount(0);
  });

  test('axe-core — no critical accessibility violations on search results page', async ({ page }) => {
    // Wait for content before scanning so axe has a full DOM
    await expect(page.locator('article[role="article"]').first()).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    // Report violations in a readable format if the assertion fails
    expect(
      results.violations,
      `axe violations:\n${results.violations.map((v) => `  [${v.impact}] ${v.id}: ${v.description}`).join('\n')}`,
    ).toEqual([]);
  });
});
