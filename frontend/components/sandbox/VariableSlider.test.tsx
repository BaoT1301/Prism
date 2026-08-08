// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { VariableSlider } from "./VariableSlider";
import type { SandboxVariable } from "../../features/sandbox/sandbox-types";

const massVariable: SandboxVariable = { id: "mass", label: "Basketball mass", unit: "kg", min: 0.4, max: 0.8, step: 0.05, default: 0.6, editable: true };

describe("VariableSlider", () => {
  it("exposes a unit-aware accessible value and a clean label", () => {
    render(<VariableSlider variable={massVariable} value={0.6} onChange={() => {}} />);
    // Native <input type="range"> carries the implicit ARIA "slider" role.
    const slider = screen.getByRole("slider", { name: "Basketball mass" });
    expect(slider).toBe(screen.getByTestId("variable-slider-mass"));
    expect(slider.getAttribute("aria-valuetext")).toBe("0.6 kg");
  });

  it("reports numeric changes to onChange", () => {
    const onChange = vi.fn();
    render(<VariableSlider variable={massVariable} value={0.6} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("variable-slider-mass"), { target: { value: "0.7" } });
    expect(onChange).toHaveBeenCalledWith(0.7);
  });
});
