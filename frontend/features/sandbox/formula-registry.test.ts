import { describe, expect, it } from "vitest";

import {
  calculateFormula,
  FORMULA_DEFINITIONS,
  FORMULA_REGISTRY,
  getFormulaDefinition,
  isFormulaId,
} from "./formula-registry";
import type { FormulaId } from "./sandbox-types";

describe("formula registry", () => {
  it("computes force = mass × acceleration", () => {
    expect(calculateFormula("force_equals_mass_times_acceleration", { mass: 0.6, acceleration: 8 })).toBe(4.8);
    expect(calculateFormula("force_equals_mass_times_acceleration", { mass: 800, acceleration: 12 })).toBe(9600);
  });

  it("computes kinetic energy = ½ · mass · velocity²", () => {
    expect(calculateFormula("kinetic_energy", { mass: 70, velocity: 10 })).toBe(3500);
    expect(calculateFormula("kinetic_energy", { mass: 2, velocity: 0 })).toBe(0);
    // Doubling velocity quadruples the energy.
    expect(calculateFormula("kinetic_energy", { mass: 1, velocity: 4 })).toBe(
      4 * calculateFormula("kinetic_energy", { mass: 1, velocity: 2 }),
    );
  });

  it("computes momentum = mass × velocity", () => {
    expect(calculateFormula("momentum", { mass: 1200, velocity: 15 })).toBe(18000);
    expect(calculateFormula("momentum", { mass: 3, velocity: -4 })).toBe(-12);
  });

  it("computes voltage = current × resistance", () => {
    expect(calculateFormula("ohms_law", { current: 2, resistance: 220 })).toBe(440);
    expect(calculateFormula("ohms_law", { current: 0.5, resistance: 100 })).toBe(50);
  });

  it("computes work = force × distance", () => {
    expect(calculateFormula("work_done", { force: 150, distance: 4 })).toBe(600);
    expect(calculateFormula("work_done", { force: 0, distance: 10 })).toBe(0);
  });

  it("throws for non-finite inputs rather than returning NaN", () => {
    expect(() => calculateFormula("kinetic_energy", { mass: Number.NaN, velocity: 5 })).toThrow();
    expect(() => calculateFormula("ohms_law", { current: 2, resistance: Number.POSITIVE_INFINITY })).toThrow();
  });

  it("rejects an unknown formula id", () => {
    expect(() => calculateFormula("not_a_formula" as FormulaId, {})).toThrow(/Unsupported formula/);
    expect(isFormulaId("kinetic_energy")).toBe(true);
    expect(isFormulaId("not_a_formula")).toBe(false);
    expect(isFormulaId(42)).toBe(false);
  });

  it("keeps definition metadata self-consistent", () => {
    const ids = Object.keys(FORMULA_DEFINITIONS) as FormulaId[];
    expect(ids).toHaveLength(5);
    for (const id of ids) {
      const definition = getFormulaDefinition(id);
      expect(definition.id).toBe(id);
      expect(definition.inputs.length).toBeGreaterThanOrEqual(2);
      expect(definition.output.label.length).toBeGreaterThan(0);
      expect(definition.output.unit.length).toBeGreaterThan(0);
      expect(definition.expression.length).toBeGreaterThan(0);
      // The calculator-only map must delegate to the same pure function.
      expect(FORMULA_REGISTRY[id]).toBe(definition.compute);
    }
  });
});
