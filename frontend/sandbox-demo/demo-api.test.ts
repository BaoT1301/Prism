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
      session: { id: "old", version: 9, status: "in_progress", completed_step_ids: ["step-1", "step-2", "step-3"], responses: {}, hints_used: 0 },
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
    });
    const reloaded = await api.getSession(saved.id);
    expect(reloaded.version).toBe(2);
    expect(reloaded.completed_step_ids).toEqual(["step-1"]);
    expect(reloaded.responses.mass).toBe(0.7);
  });
});
