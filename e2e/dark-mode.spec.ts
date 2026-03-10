/**
 * E2E — Dark Mode Toggle
 *
 * Spec refs:
 *   - phase-10-hardening.md §10.2: "Dark mode toggle: switches appearance;
 *     class 'dark' on <html> persists after reload"
 *   - UI_UX_SPEC.md: "Toggled via sun/moon icon button; persists via localStorage
 *     → sets class='dark' on <html>"
 *   - Header.tsx: DARK_MODE_KEY = 'poster-pilot:dark-mode'
 *
 * No API mocking is required — this test exercises only client-side state.
 */
import { test, expect } from '@playwright/test';

test.describe('Dark mode', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate with empty localStorage (default Playwright context)
    // OS preference is unset in Playwright → initial state is light mode
    await page.goto('/');
  });

  test('initial state is light mode (no dark class)', async ({ page }) => {
    const html = page.locator('html');
    // In a fresh context, localStorage is empty → getInitialDarkMode() → false
    await expect(html).not.toHaveClass(/dark/);
  });

  test('toggle adds dark class to <html>', async ({ page }) => {
    const toggleBtn = page.getByRole('button', { name: 'Switch to dark mode' });
    await expect(toggleBtn).toBeVisible();

    await toggleBtn.click();

    const html = page.locator('html');
    await expect(html).toHaveClass(/dark/);
  });

  test('dark mode persists in localStorage', async ({ page }) => {
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();

    // Verify the localStorage key is set correctly (Header.tsx: 'poster-pilot:dark-mode')
    const storedValue = await page.evaluate(() =>
      localStorage.getItem('poster-pilot:dark-mode'),
    );
    expect(storedValue).toBe('true');
  });

  test('dark class persists after full page reload', async ({ page }) => {
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();

    // Confirm dark before reload
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.reload();

    // After reload, Header reads localStorage and re-applies dark class synchronously
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('toggling twice returns to light mode', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Switch to dark mode' });
    await btn.click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    // The button label flips when dark mode is active
    await page.getByRole('button', { name: 'Switch to light mode' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });
});
