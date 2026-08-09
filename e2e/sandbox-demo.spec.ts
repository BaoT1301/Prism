import { expect, test, type Page } from "@playwright/test";

/**
 * E2E coverage for the no-auth sandbox demo (`/sandbox-demo.html`).
 * Each test runs in a fresh browser context, so localStorage starts empty and
 * the demo always opens on a fresh, unsubmitted session.
 */

const DEMO_URL = "/sandbox-demo.html";

/** The five canonical formulas surfaced in the demo's fixture picker, and the
 *  two sliders that drive each one to completion. */
const FIXTURES: { label: string; value: string; sliders: [string, string] }[] = [
  { label: "Basketball · F = ma", value: "basketball", sliders: ["mass", "acceleration"] },
  { label: "Sprint · Kinetic energy", value: "kinetic-energy", sliders: ["mass", "velocity"] },
  { label: "Collision · Momentum", value: "momentum", sliders: ["mass", "velocity"] },
  { label: "Circuit · Ohm's law", value: "ohms-law", sliders: ["current", "resistance"] },
  { label: "Pulley · Work done", value: "work-done", sliders: ["force", "distance"] },
];

/** Nudge a range slider by firing real keyboard events React handles natively. */
async function nudgeSlider(page: Page, id: string, presses: number, key: "ArrowRight" | "ArrowLeft" = "ArrowRight") {
  const slider = page.getByTestId(`variable-slider-${id}`);
  await expect(slider).toBeVisible();
  await slider.focus();
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press(key);
  }
}

async function selectFixture(page: Page, value: string, firstSlider: string) {
  await page.getByTestId("fixture-select").selectOption(value);
  // Wait for the freshly-launched sandbox (re-keyed by session id) to mount.
  await expect(page.getByTestId(`variable-slider-${firstSlider}`)).toBeVisible();
}

/** Change both driving variables + answer the reflection → mission completes. */
async function driveToCompletion(page: Page, sliders: [string, string]) {
  await nudgeSlider(page, sliders[0], 6);
  await nudgeSlider(page, sliders[1], 6);
  await page.getByTestId("reflection-reflection-1-choice-0").click();
  const complete = page.getByTestId("complete-mission");
  await expect(complete).toBeEnabled({ timeout: 10_000 });
  await complete.click();
}

test.describe("sandbox demo — no-auth interactive flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEMO_URL);
    // The app intentionally keeps ambient animation even under reduced-motion, so
    // freeze animation/transition here for deterministic, non-flaky interactions.
    await page.addStyleTag({
      content: "*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }",
    });
    await expect(page.getByTestId("sandbox-app")).toBeVisible();
    // The error boundary must never be the thing that renders.
    await expect(page.getByTestId("error-boundary")).toHaveCount(0);
  });

  // Every formula must be completable end to end from its own fixture.
  for (const fixture of FIXTURES) {
    test(`completes the mission end to end — ${fixture.label}`, async ({ page }) => {
      await selectFixture(page, fixture.value, fixture.sliders[0]);
      await driveToCompletion(page, fixture.sliders);
      await expect(page.getByTestId("completion-screen")).toBeVisible();
    });
  }

  test("shows the live relationship graph and records compared runs", async ({ page }) => {
    await selectFixture(page, "basketball", "mass");
    await expect(page.getByTestId("relationship-graph")).toBeVisible();

    // Running an experiment snapshots a comparable run.
    await page.getByTestId("run-experiment").click();
    await expect(page.getByTestId("run-item-1")).toBeVisible();

    // Clearing removes recorded runs.
    await page.getByTestId("clear-runs").click();
    await expect(page.getByTestId("run-item-1")).toHaveCount(0);
  });

  test("preserves a typed reflection explanation when the choice changes (M1)", async ({ page }) => {
    const explanation = page.getByTestId("reflection-reflection-1-explanation");
    await explanation.fill("Because acceleration rose while mass stayed the same.");

    // Switching the multiple-choice option must not wipe the written answer.
    await page.getByTestId("reflection-reflection-1-choice-0").click();
    await page.getByTestId("reflection-reflection-1-choice-1").click();

    await expect(explanation).toHaveValue(/acceleration rose/);
  });

  test("exposes accessible slider semantics (L3)", async ({ page }) => {
    const mass = page.getByTestId("variable-slider-mass");
    // A native <input type="range"> carries an implicit ARIA slider role, so the
    // control is reachable by role + accessible name (no redundant role attribute).
    await expect(page.getByRole("slider", { name: /mass/i })).toBeVisible();
    // aria-valuetext must announce a unit-aware value ("0.6 kg"), not a bare number.
    await expect(mass).toHaveAttribute("aria-valuetext", /\d.*[a-z]/i);
    await expect(mass).toHaveAttribute("aria-label", /.+/);
  });

  test("resets to a fresh session after submitting", async ({ page }) => {
    await selectFixture(page, "basketball", "mass");
    await driveToCompletion(page, ["mass", "acceleration"]);
    await expect(page.getByTestId("completion-screen")).toBeVisible();

    // Reset returns to a fresh, unsubmitted sandbox rather than the completion screen.
    await page.getByTestId("reset-demo").click();
    await expect(page.getByTestId("sandbox-app")).toBeVisible();
    await expect(page.getByTestId("completion-screen")).toHaveCount(0);
  });
});
