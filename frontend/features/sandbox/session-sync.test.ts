import { describe, expect, it } from "vitest";

import { createSerialRunner, isConflictError, rebaseOntoServer, sanitizeSession } from "./session-sync";
import type { SandboxSession } from "./sandbox-types";

describe("isConflictError", () => {
  it("is true only for a 409 status", () => {
    expect(isConflictError({ status: 409 })).toBe(true);
    expect(isConflictError({ status: 500 })).toBe(false);
    expect(isConflictError(new Error("nope"))).toBe(false);
    expect(isConflictError(null)).toBe(false);
  });
});

describe("sanitizeSession", () => {
  it("coerces a malformed payload into a render-safe shape", () => {
    const session = sanitizeSession({
      id: 5,
      version: "3",
      status: "weird",
      completed_step_ids: ["a", 2, "b"],
      responses: { mass: "0.6", bad: "x", acc: 8 },
      reflection_answers: [{ question_id: "q", answer: "a" }, { nope: true }],
      hints_used: null,
    });
    expect(session.id).toBe("");
    expect(session.version).toBe(3);
    expect(session.status).toBe("in_progress");
    expect(session.completed_step_ids).toEqual(["a", "b"]);
    expect(session.responses).toEqual({ mass: 0.6, acc: 8 });
    expect(session.reflection_answers).toEqual([{ question_id: "q", answer: "a" }]);
    expect(session.hints_used).toBe(0);
  });

  it("falls back to safe defaults for nullish input", () => {
    const session = sanitizeSession(null);
    expect(session.completed_step_ids).toEqual([]);
    expect(session.responses).toEqual({});
    expect(session.version).toBe(0);
  });
});

describe("rebaseOntoServer", () => {
  it("adopts the server version but preserves local work", () => {
    const server: SandboxSession = { id: "s", version: 7, status: "in_progress", completed_step_ids: ["step-1"], responses: { mass: 1 }, reflection_answers: [{ question_id: "q1", answer: "server" }], hints_used: 0 };
    const rebased = rebaseOntoServer(server, {
      completedStepIds: ["step-2"],
      responses: { mass: 0.6, acceleration: 8 },
      reflectionAnswers: [{ question_id: "q1", answer: "local" }, { question_id: "q2", answer: "new" }],
    });
    expect(rebased.version).toBe(7);
    expect([...rebased.completed_step_ids].sort()).toEqual(["step-1", "step-2"]);
    expect(rebased.responses).toEqual({ mass: 0.6, acceleration: 8 });
    expect(rebased.reflection_answers).toEqual([{ question_id: "q1", answer: "local" }, { question_id: "q2", answer: "new" }]);
  });
});

describe("createSerialRunner", () => {
  it("never runs the task concurrently and coalesces in-flight calls into one follow-up", async () => {
    let active = 0;
    let maxActive = 0;
    let runs = 0;
    const gates: Array<() => void> = [];
    const task = () => {
      runs++;
      active++;
      maxActive = Math.max(maxActive, active);
      return new Promise<void>((resolve) => { gates.push(() => { active--; resolve(); }); });
    };
    const runner = createSerialRunner(task);

    const done = runner.run();
    runner.run();
    runner.run();
    expect(runs).toBe(1); // only the first run has started

    gates.shift()!(); // finish run 1 -> the pending follow-up starts
    await Promise.resolve();
    await Promise.resolve();
    expect(runs).toBe(2); // exactly one coalesced follow-up, not three

    gates.shift()!(); // finish run 2
    await done;
    expect(runs).toBe(2);
    expect(maxActive).toBe(1); // never overlapped
  });

  it("settled resolves immediately when idle", async () => {
    const runner = createSerialRunner(async () => {});
    await expect(runner.settled()).resolves.toBeUndefined();
  });
});
