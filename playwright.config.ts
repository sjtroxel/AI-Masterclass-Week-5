import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Phase 10.2 — Critical E2E Flows.
 *
 * All /api/* calls are intercepted via page.route() in each spec — no live
 * Express server is required. Only the Vite dev client (port 5173) is started.
 *
 * See: project-specs/roadmap/phase-10-hardening.md §10.2
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  /* Fail CI immediately if a .only is accidentally committed */
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: {
    /** Only the Vite client — API calls are mocked via page.route(). */
    command: 'npm run dev:client',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
