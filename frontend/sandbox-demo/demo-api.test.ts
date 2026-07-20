import { describe, expect, it } from "vitest";
import basketball from "../features/sandbox/fixtures/basketball.json";
import { validateSandboxSpec } from "../features/sandbox/sandbox-validation";
import { createDemoSandboxApi } from "./demo-api";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe("local sandbox demo API", () => {
  it("starts a new demo session without stale completion state", async () => {
    const storage = memoryStorage();
    storage.setItem("prism-sandbox-demo:Basketball Force Lab", JSON.stringify({
      session: { id: "old", version: 9, status: "in_progress", completed_step_ids: ["step-1", "step-2", "step-3"], responses: {}, reflection_answers: [], hints_used: 0 },
    }));
    const launch = await createDemoSandboxApi(validateSandboxSpec(basketball), storage).launchAssignment("demo-assignment");
    expect(launch.session.completed_step_ids).toEqual([]);
  });

  it("persists progress and returns three different progressive hints", async () => {
    const api = createDemoSandboxApi(validateSandboxSpec(basketball), memoryStorage());
    const launch = await api.launchAssignment("demo-assignment");
    const hints = await Promise.all([
      api.requestHint(launch.session.id, "help", "step-1"),
      api.requestHint(launch.session.id, "help", "step-1"),
      api.requestHint(launch.session.id, "help", "step-1"),
    ]);
    expect(new Set(hints.map((item) => item.hint)).size).toBe(3);
    expect(hints[2].remaining_hint_levels).toBe(0);

    const saved = await api.updateProgress(launch.session.id, {
      expected_version: launch.session.version,
      completed_step_ids: ["step-1"],
      responses: { mass: 0.7, acceleration: 8 },
      reflection_answers: [{ question_id: "reflection-1", answer: "Force increases." }],
    });
    const reloaded = await api.getSession(saved.id);
    expect(reloaded.version).toBe(2);
    expect(reloaded.completed_step_ids).toEqual(["step-1", "step-3"]);
    expect(reloaded.responses.mass).toBe(0.7);
    expect(reloaded.reflection_answers).toEqual([{ question_id: "reflection-1", answer: "Force increases." }]);
  });

  it("bases coach hints on the student's recorded slider movement", async () => {
    const api = createDemoSandboxApi(validateSandboxSpec(basketball), memoryStorage());
    const launch = await api.launchAssignment("demo-assignment");
    const saved = await api.updateProgress(launch.session.id, {
      expected_version: launch.session.version,
      completed_step_ids: [],
      responses: { mass: 0.7, acceleration: 8 },
      reflection_answers: [],
      interaction_events: [{
        event_type: "slider_changed",
        recorded_at: "2026-07-18T12:00:00Z",
        variable_id: "mass",
        previous_value: 0.6,
        value: 0.7,
      }],
    });

    expect(saved.interaction_events).toMatchObject([{ variable_id: "mass", direction: "increased" }]);
    await expect(api.requestHint(saved.id, "", "step-1")).resolves.toMatchObject({
      hint: expect.stringContaining("moved basketball mass up"),
    });
  });

  it("replaces stale demo state that no longer fits the active fixture", async () => {
    const storage = memoryStorage();
    storage.setItem("prism-sandbox-demo:v3:Basketball Force Lab", JSON.stringify({
      session: { id: "stale", version: 2, status: "in_progress", completed_step_ids: ["step-1"], responses: { mass: 999, acceleration: 8 }, reflection_answers: [], hints_used: 0 },
    }));
    const launch = await createDemoSandboxApi(validateSandboxSpec(basketball), storage).launchAssignment("demo-assignment");
    expect(launch.session.id).not.toBe("stale");
    expect(launch.session.responses).toEqual({ mass: 0.6, acceleration: 8 });
  });

  it("completes the same hint, progress, run, and submission journey as the sandbox", async () => {
    const api = createDemoSandboxApi(validateSandboxSpec(basketball), memoryStorage());
    const launch = await api.launchAssignment("demo-assignment");
    const hint = await api.requestHint(launch.session.id, "", "step-1");
    expect(hint.remaining_hint_levels).toBe(2);
    const answers = [{ question_id: "reflection-1", answer: "Force increases when acceleration increases." }];
    await expect(api.submit(launch.session.id, launch.session.version, answers)).rejects.toMatchObject({ code: "SANDBOX_INCOMPLETE" });
    const progressed = await api.updateProgress(launch.session.id, {
      expected_version: launch.session.version,
      completed_step_ids: ["step-1", "step-2", "step-3"],
      responses: { mass: 0.65, acceleration: 8 },
      reflection_answers: answers,
      experiment_event: { event_type: "experiment_run", recorded_at: "2026-07-18T12:00:00Z", values: { mass: 0.65, acceleration: 8 }, controlled_comparison: true },
    });
    expect(progressed.interaction_events?.at(-1)?.mission_complete).toBe(true);
    const submission = await api.submit(progressed.id, progressed.version, answers);
    expect(submission.status).toBe("submitted");
    expect((await api.getSession(progressed.id)).status).toBe("submitted");
  });
});
