/**
 * E2E — The Archivist Sidebar
 *
 * Spec refs:
 *   - phase-10-hardening.md §10.2: "Archivist: type a question → streaming
 *     response appears word-by-word → citations render as links"
 *   - UI_UX_SPEC.md: ArchivistSidebar — aria-live="polite" on message container,
 *     citations as inline links to /poster/:id
 *   - ai-features.md: The Archivist system-prompt rules; citations must be clickable
 *
 * The POST /api/chat endpoint is mocked with a deterministic SSE stream
 * (see e2e/fixtures.ts: CHAT_SSE_BODY) so no real Anthropic API is called.
 *
 * Selector notes:
 *   - Two "Open The Archivist" buttons exist on search results pages (SearchPage
 *     toolbar + ArchivistSidebar fixed tab); use `.first()` — both call toggleSidebar.
 *   - When aria-hidden="true" (sidebar closed), Playwright's getByRole() cannot
 *     find the element; use the CSS locator `aside[aria-label="..."]` instead.
 *   - Two "Close The Archivist" buttons exist when open (sidebar header + tab);
 *     scope to the sidebar element to avoid strict-mode violations.
 */
import { test, expect } from '@playwright/test';
import { setupAllMocks } from './mock-api.js';
import { NARA_ID, POSTER_ID } from './fixtures.js';

/** CSS locator for the sidebar <aside> — works regardless of aria-hidden state. */
const SIDEBAR_SELECTOR = 'aside[aria-label="The Archivist — AI research assistant"]';

test.describe('Archivist sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await setupAllMocks(page);
    // Start from the search page with results so the Archivist context is populated
    await page.goto('/search?q=WPA+labor+poster&mode=text');
    // Wait for results so the Archivist toggle appears
    await expect(page.locator('article[role="article"]').first()).toBeVisible();
  });

  test('toggle tab opens the sidebar', async ({ page }) => {
    // Two "Open The Archivist" buttons exist: SearchPage toolbar + sidebar fixed tab.
    // Both call toggleSidebar; .first() picks the SearchPage toolbar button.
    const toggleBtn = page.getByRole('button', { name: 'Open The Archivist' }).first();
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click();

    const sidebar = page.locator(SIDEBAR_SELECTOR);
    // aria-hidden must be "false" when open
    await expect(sidebar).toHaveAttribute('aria-hidden', 'false');
  });

  test('message container has aria-live="polite"', async ({ page }) => {
    await page.getByRole('button', { name: 'Open The Archivist' }).first().click();

    const messageContainer = page.locator('[aria-live="polite"]').first();
    await expect(messageContainer).toBeVisible();
    await expect(messageContainer).toHaveAttribute('aria-live', 'polite');
  });

  test('sends a message and assistant response appears via SSE', async ({ page }) => {
    await page.getByRole('button', { name: 'Open The Archivist' }).first().click();

    const textarea = page.getByRole('textbox', { name: 'Message to The Archivist' });
    await expect(textarea).toBeVisible();

    await textarea.fill('Tell me about the WPA labor poster');
    await page.getByRole('button', { name: 'Send message' }).click();

    // User message bubble should appear immediately
    await expect(
      page.getByText('Tell me about the WPA labor poster'),
    ).toBeVisible();

    // Assistant response — assembled from SSE delta tokens
    await expect(
      page.getByText(/promoted labor programs/),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('citations render as clickable links after streaming completes', async ({ page }) => {
    await page.getByRole('button', { name: 'Open The Archivist' }).first().click();

    const textarea = page.getByRole('textbox', { name: 'Message to The Archivist' });
    await textarea.fill('Tell me about the WPA labor poster');
    await page.getByRole('button', { name: 'Send message' }).click();

    // Wait for the done event to fire (citations appear after streaming ends)
    const citationLink = page.getByRole('link', { name: `[${NARA_ID}]` });
    await expect(citationLink).toBeVisible({ timeout: 8_000 });

    // Citation must navigate to the correct poster detail page
    const href = await citationLink.getAttribute('href');
    expect(href).toBe(`/poster/${POSTER_ID}`);
  });

  test('Enter key submits the message', async ({ page }) => {
    await page.getByRole('button', { name: 'Open The Archivist' }).first().click();

    const textarea = page.getByRole('textbox', { name: 'Message to The Archivist' });
    await textarea.fill('What era is this from?');
    await textarea.press('Enter');

    await expect(page.getByText('What era is this from?')).toBeVisible();
  });

  test('close button hides the sidebar', async ({ page }) => {
    await page.getByRole('button', { name: 'Open The Archivist' }).first().click();

    const sidebar = page.locator(SIDEBAR_SELECTOR);
    await expect(sidebar).toHaveAttribute('aria-hidden', 'false');

    // Scope the close button to the sidebar to avoid the fixed tab (which also
    // changes its aria-label to "Close The Archivist" when the sidebar is open).
    await sidebar.getByRole('button', { name: 'Close The Archivist' }).click();

    // aria-hidden reverts to "true" when closed
    await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
  });
});
