import { describe, expect, it } from "vitest";
import basketball from "../features/sandbox/fixtures/basketball.json";
import { validateSandboxSpec } from "../features/sandbox/sandbox-validation";
import { createDemoSandboxApi, demoStorageKey } from "./demo-api";

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
  const spec = validateSandboxSpec(basketball);

  it("ignores state stored under a previous storage version", async () => {
    const storage = memoryStorage();
    // Seed under the *legacy* key; the current version must not read it.
    storage.setItem(demoStorageKey(spec, "v1"), JSON.stringify({
      session: { id: "old", version: 9, status: "in_progress", completed_step_ids: ["step-1", "step-2", "step-3"], responses: {}, reflection_answers: [], hints_used: 0 },
    }));
    const launch = await createDemoSandboxApi(spec, storage).launchAssignment("demo-assignment");
    expect(launch.session.completed_step_ids).toEqual([]);
    expect(launch.session.version).toBe(1);
  });

  it("resumes progress stored under the current key", async () => {
    const storage = memoryStorage();
    // Seed under the *current* key (via the real builder) so it must collide.
    storage.setItem(demoStorageKey(spec), JSON.stringify({
      session: { id: "resume", version: 4, status: "in_progress", completed_step_ids: ["step-1"], responses: { mass: 0.7, acceleration: 8 }, reflection_answers: [], hints_used: 1 },
    }));
    const launch = await createDemoSandboxApi(spec, storage).launchAssignment("demo-assignment");
    expect(launch.session.id).toBe("resume");
    expect(launch.session.version).toBe(4);
    expect(launch.session.completed_step_ids).toEqual(["step-1"]);
    expect(launch.cache_status).toBe("hit");
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
    expect(reloaded.completed_step_ids).toEqual(["step-1"]);
    expect(reloaded.responses.mass).toBe(0.7);
    expect(reloaded.reflection_answers).toEqual([{ question_id: "reflection-1", answer: "Force increases." }]);
  });
});
