import { describe, expect, it } from "vitest";

import basketball from "./fixtures/basketball.json";
import kineticEnergy from "./fixtures/kinetic-energy.json";
import momentum from "./fixtures/momentum.json";
import ohmsLaw from "./fixtures/ohms-law.json";
import workDone from "./fixtures/work-done.json";
import { mergeCompletedStepIds } from "./completion";
import { calculateFormula, getFormulaDefinition } from "./formula-registry";
import { progressPercentage } from "./progress";
import { validateSandboxSpec } from "./sandbox-validation";
import type { ReflectionAnswer } from "./sandbox-types";

const DEMO_FIXTURES = [
  { name: "basketball", raw: basketball },
  { name: "kinetic-energy", raw: kineticEnergy },
  { name: "momentum", raw: momentum },
  { name: "ohms-law", raw: ohmsLaw },
  { name: "work-done", raw: workDone },
];

describe("demo fixtures", () => {
  it("covers all five canonical formulas exactly once", () => {
    const formulaIds = DEMO_FIXTURES.map((fixture) => validateSandboxSpec(fixture.raw).formula_id);
    expect(new Set(formulaIds)).toEqual(
      new Set(["force_equals_mass_times_acceleration", "kinetic_energy", "momentum", "ohms_law", "work_done"]),
    );
  });

  it.each(DEMO_FIXTURES)("$name validates and exposes its formula inputs as variables", ({ raw }) => {
    const spec = validateSandboxSpec(raw);
    const definition = getFormulaDefinition(spec.formula_id);
    const variableIds = new Set(spec.variables.map((variable) => variable.id));
    for (const input of definition.inputs) {
      expect(variableIds.has(input)).toBe(true);
    }
    // Defaults must produce a finite, real output through the pure calculator.
    const defaults = Object.fromEntries(spec.variables.map((variable) => [variable.id, variable.default]));
    expect(Number.isFinite(calculateFormula(spec.formula_id, defaults))).toBe(true);
  });

  it.each(DEMO_FIXTURES)("$name reaches 100% when both inputs change and the reflection is answered", ({ raw }) => {
    const spec = validateSandboxSpec(raw);
    const definition = getFormulaDefinition(spec.formula_id);
    // Nudge every input off its default (what the E2E slider drags achieve).
    const responses = Object.fromEntries(
      spec.variables.map((variable) => [variable.id, definition.inputs.includes(variable.id) ? variable.default + variable.step : variable.default]),
    );
    const answers: ReflectionAnswer[] = spec.reflection_questions.map((question) => ({ question_id: question.id, answer: `${definition.output.label} increases.` }));
    const completed = mergeCompletedStepIds(spec, [], responses, answers);
    expect(progressPercentage(spec.guided_steps, completed)).toBe(100);
  });
});
