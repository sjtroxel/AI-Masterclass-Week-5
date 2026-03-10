/**
 * E2E — Search Handoff (The Red Button)
 *
 * Spec refs:
 *   - phase-10-hardening.md §10.2: "Nonsense query → HandoffBanner appears;
 *     'Request Expert Review' generates correct mailto:"
 *   - UI_UX_SPEC.md: HandoffBanner — role="alert", WPA-red border, mailto: CTA,
 *     Dismiss option
 *
 * When the API returns human_handoff_needed=true, HandoffBanner must appear
 * with role="alert" and the "Request Expert Review" link must carry a
 * pre-filled mailto: href pointing to nara-reference@archives.gov.
 */
import { test, expect } from '@playwright/test';
import { mockSearchHandoff } from './mock-api.js';

test.describe('Search — human handoff (Red Button)', () => {
  test.beforeEach(async ({ page }) => {
    await mockSearchHandoff(page);
    await page.goto('/search?q=asdfzxcvqwer&mode=text');
  });

  test('HandoffBanner appears with role="alert"', async ({ page }) => {
    const banner = page.locator(
      '[role="alert"][aria-label="Low-confidence results — expert review available"]',
    );
    await expect(banner).toBeVisible();
  });

  test('"Request Expert Review" link carries a mailto: href', async ({ page }) => {
    const cta = page.getByRole('link', { name: 'Request Expert Review' });
    await expect(cta).toBeVisible();

    const href = await cta.getAttribute('href');
    expect(href).not.toBeNull();
    expect(href!.startsWith('mailto:nara-reference@archives.gov')).toBe(true);
    // Subject line must be present; encodeURIComponent uses %XX not + encoding
    expect(href).toContain('subject=');
    expect(href).toContain('Expert%20Review');
  });

  test('low-confidence results are still shown below the banner', async ({ page }) => {
    // Results are shown even at low confidence — "invitation not a wall" (UI_UX_SPEC.md)
    const cards = page.locator('article[role="article"]');
    await expect(cards.first()).toBeVisible();
  });

  test('Dismiss removes the banner', async ({ page }) => {
    const banner = page.locator(
      '[role="alert"][aria-label="Low-confidence results — expert review available"]',
    );
    await expect(banner).toBeVisible();

    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(banner).toHaveCount(0);
  });
});
