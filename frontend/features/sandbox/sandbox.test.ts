import basketball from "./fixtures/basketball.json";
import formula1 from "./fixtures/formula1.json";
import space from "./fixtures/space.json";
import { describe, expect, it } from "vitest";
import { automaticallyCompletedStepIds, completionRulesSatisfied, mergeCompletedStepIds } from "./completion";
import { calculateFormula } from "./formula-registry";
import { buildProgressRequest, progressPercentage } from "./progress";
import { validateSandboxSpec } from "./sandbox-validation";

describe("sandbox contract", () => {
  it.each([basketball, formula1, space])("accepts the %s fixture", (fixture) => {
    expect(validateSandboxSpec(fixture).sandbox_type).toBe("parameter_explorer");
  });

  it("accepts a cached pre-mission sandbox specification", () => {
    const cachedSpec: Record<string, unknown> = structuredClone(basketball);
    delete cachedSpec.mission;
    expect(validateSandboxSpec(cachedSpec).mission).toBeUndefined();
  });

  it("accepts only the finite personal-scene catalog", () => {
    expect(validateSandboxSpec(basketball).personal_scene?.label).toBe("Your after-school court");
    const scienceScene: Record<string, unknown> = structuredClone(basketball);
    (scienceScene.personal_scene as Record<string, unknown>).setting = "science_lab";
    (scienceScene.personal_scene as Record<string, unknown>).primary_prop = "microscope";
    (scienceScene.personal_scene as Record<string, unknown>).accent_props = ["robot", "planet"];
    expect(validateSandboxSpec(scienceScene).personal_scene?.primary_prop).toBe("microscope");
    const unsafeScene: Record<string, unknown> = structuredClone(basketball);
    (unsafeScene.personal_scene as Record<string, unknown>).setting = "private_home";
    expect(() => validateSandboxSpec(unsafeScene)).toThrow("personal scene");
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

  it("includes bounded slider interactions in progress updates", () => {
    const session = { id: "session", version: 4, status: "in_progress" as const, completed_step_ids: [], responses: {}, reflection_answers: [], hints_used: 0 };
    expect(buildProgressRequest(session, [], { mass: 0.7, acceleration: 8 }, [], undefined, [{ event_type: "slider_changed", recorded_at: "2026-07-18T12:00:00Z", variable_id: "mass", previous_value: 0.6, value: 0.7, elapsed_ms: 500 }])).toEqual({
      expected_version: 4,
      completed_step_ids: [],
      responses: { mass: 0.7, acceleration: 8 },
      reflection_answers: [],
      interaction_events: [{ event_type: "slider_changed", recorded_at: "2026-07-18T12:00:00Z", variable_id: "mass", previous_value: 0.6, value: 0.7, elapsed_ms: 500 }],
    });
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

  it("matches backend submission rules before enabling completion", () => {
    const spec = validateSandboxSpec(basketball);
    expect(completionRulesSatisfied(spec, ["step-1", "step-2"], [])).toBe(false);
    expect(completionRulesSatisfied(spec, ["step-1", "step-2", "step-3"], [{ question_id: "reflection-1", answer: "Force increases." }])).toBe(true);
  });
});
