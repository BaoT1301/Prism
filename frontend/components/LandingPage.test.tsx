// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LandingPage } from "./LandingPage";

describe("LandingPage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("moves and resets the hero artwork with the pointer", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    render(<LandingPage isSignedIn={false} onEnter={vi.fn()} />);
    const hero = screen.getByLabelText(/one physics objective branching/i);
    vi.spyOn(hero, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 200,
    } as DOMRect);

    fireEvent(hero, new MouseEvent("pointermove", { bubbles: true, clientX: 150, clientY: 50 }));

    expect(hero.style.getPropertyValue("--hero-tilt-x")).toBe("1.25deg");
    expect(hero.style.getPropertyValue("--hero-tilt-y")).toBe("1.25deg");
    expect(hero.style.getPropertyValue("--hero-shift-x")).toBe("2.5px");
    expect(hero.style.getPropertyValue("--hero-shift-y")).toBe("-2.5px");

    fireEvent.pointerLeave(hero);
    expect(hero.style.getPropertyValue("--hero-tilt-x")).toBe("");
    expect(hero.style.getPropertyValue("--hero-shift-y")).toBe("");
  });

  it("cycles through the progressive hint preview", async () => {
    const user = userEvent.setup();
    render(<LandingPage isSignedIn={false} onEnter={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Ask for a hint" }));
    expect(screen.getByText(/keep mass steady, then raise acceleration/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next hint (1 of 3)" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Next hint (1 of 3)" }));
    expect(screen.getByText(/compare two runs that change only one variable/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Next hint (2 of 3)" }));
    expect(screen.getByText(/use F = ma to explain the relationship/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restart hints" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Restart hints" }));
    expect(screen.getByText(/keep mass steady, then raise acceleration/i)).toBeTruthy();
  });

  it("opens Prism from the interactive product preview", async () => {
    const user = userEvent.setup();
    const onEnter = vi.fn();
    render(<LandingPage isSignedIn onEnter={onEnter} />);

    await user.click(screen.getByRole("button", { name: /try it in prism/i }));

    expect(onEnter).toHaveBeenCalledTimes(1);
  });
});
