import { expect, test, type Page } from "@playwright/test";

/**
 * E2E coverage for the no-auth sandbox demo (`/sandbox-demo.html`).
 * Each test runs in a fresh browser context, so localStorage starts empty and
 * the demo always opens on a fresh, unsubmitted session.
 */

const DEMO_URL = "/sandbox-demo.html";

/** Nudge a range slider by firing real keyboard events React handles natively. */
async function nudgeSlider(page: Page, testid: string, presses: number, key: "ArrowRight" | "ArrowLeft" = "ArrowRight") {
  const slider = page.getByTestId(testid);
  await expect(slider).toBeVisible();
  await slider.focus();
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press(key);
  }
}

test.describe("sandbox demo — no-auth interactive flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEMO_URL);
    await expect(page.getByTestId("sandbox-app")).toBeVisible();
    // The error boundary must never be the thing that renders.
    await expect(page.getByTestId("error-boundary")).toHaveCount(0);
  });

  test("completes the guided mission end to end", async ({ page }) => {
    // Completing the mission is gated on: mass changed, acceleration increased,
    // and the reflection answered. Drive each through real interactions.
    await nudgeSlider(page, "variable-slider-mass", 6);
    await nudgeSlider(page, "variable-slider-acceleration", 6);

    // Answer the reflection (auto-completes the final guided step).
    await page.getByTestId("reflection-reflection-1-choice-0").click();

    // With all three steps satisfied the completion rule fires.
    const complete = page.getByTestId("complete-mission");
    await expect(complete).toBeEnabled({ timeout: 10_000 });

    await complete.click();
    await expect(page.getByTestId("completion-screen")).toBeVisible();
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

  test("resets to a fresh session after submitting (autosave/reset)", async ({ page }) => {
    await nudgeSlider(page, "variable-slider-mass", 6);
    await nudgeSlider(page, "variable-slider-acceleration", 6);
    await page.getByTestId("reflection-reflection-1-choice-0").click();
    await page.getByTestId("complete-mission").click();
    await expect(page.getByTestId("completion-screen")).toBeVisible();

    // Reset returns to a fresh, unsubmitted sandbox rather than the completion screen.
    await page.getByTestId("reset-demo").click();
    await expect(page.getByTestId("sandbox-app")).toBeVisible();
    await expect(page.getByTestId("completion-screen")).toHaveCount(0);
  });
});
