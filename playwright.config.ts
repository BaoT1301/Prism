import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the fixture-backed, no-auth `sandbox-demo`
 * entry (`/sandbox-demo.html`). It exercises the full interactive sandbox —
 * variables, guided steps, reflection, autosave, completion — with zero Clerk
 * auth and zero backend, so the suite is deterministic in CI.
 *
 * The authenticated app requires Clerk sign-in and is covered by unit/
 * integration tests instead; wiring Clerk test tokens into Playwright is a
 * documented follow-up.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    headless: true,
    // The playground has continuous ambient motion; emulating reduced-motion
    // (which the app honors) keeps interactions deterministic in CI and also
    // exercises the reduced-motion code path.
    reducedMotion: "reduce",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173/sandbox-demo.html",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
