import basketball from "./fixtures/basketball.json";
import formula1 from "./fixtures/formula1.json";
import space from "./fixtures/space.json";
import { describe, expect, it } from "vitest";
import { automaticallyCompletedStepIds, mergeCompletedStepIds } from "./completion";
import { calculateFormula } from "./formula-registry";
import { buildProgressRequest, progressPercentage } from "./progress";
import { validateSandboxSpec } from "./sandbox-validation";

describe("sandbox contract", () => {
  it.each([basketball, formula1, space])("accepts the %s fixture", (fixture) => {
    expect(validateSandboxSpec(fixture).sandbox_type).toBe("parameter_explorer");
  });

  it("calculates force only through the known formula registry", () => {
    expect(calculateFormula("force_equals_mass_times_acceleration", { mass: 0.6, acceleration: 8 })).toBe(4.8);
  });

  it("calculates guided-step progress and preserves the session version", () => {
    const session = { id: "session", version: 4, status: "in_progress" as const, completed_step_ids: [], responses: {}, reflection_answers: [], hints_used: 0 };
    const spec = validateSandboxSpec(basketball);
    expect(progressPercentage(spec.guided_steps, ["step-1"])).toBe(33);
    expect(buildProgressRequest(session, ["step-1"], { mass: 0.6, acceleration: 8 }, [{ question_id: "reflection-1", answer: "Force increases." }])).toEqual({ expected_version: 4, completed_step_ids: ["step-1"], responses: { mass: 0.6, acceleration: 8 }, reflection_answers: [{ question_id: "reflection-1", answer: "Force increases." }] });
  });

  it("automatically completes value and reflection checks", () => {
    const spec = validateSandboxSpec(basketball);
    expect(automaticallyCompletedStepIds(spec, { mass: 0.7, acceleration: 8 }, [])).toEqual(["step-1"]);
    expect(automaticallyCompletedStepIds(spec, { mass: 0.7, acceleration: 9 }, [{ question_id: "reflection-1", answer: "Force increases." }])).toEqual(["step-1", "step-2", "step-3"]);
  });

  it("keeps a completed step after the value returns to its default", () => {
    const spec = validateSandboxSpec(basketball);
    expect(mergeCompletedStepIds(spec, ["step-1"], { mass: 0.6, acceleration: 8 }, [])).toEqual(["step-1"]);
  });
});
