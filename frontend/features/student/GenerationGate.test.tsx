// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../../lib/api-client";
import basketball from "../sandbox/fixtures/basketball.json";
import { validateSandboxSpec } from "../sandbox/sandbox-validation";
import type { SandboxLaunch } from "../sandbox/sandbox-types";
import { GenerationGate, GenerationPending } from "./GenerationGate";
import type { GenerationStatus } from "./student-api";

const spec = validateSandboxSpec(basketball);
const readyLaunch: SandboxLaunch = {
  assignment: {
    id: "g1",
    assignment_id: "a1",
    student_id: "s1",
    personalized_title: spec.title,
    scenario: spec.introduction,
    problem_statement: "Explore the variables.",
    learning_objective: "Apply the formula.",
    instructions: [],
    reflection_questions: spec.reflection_questions,
    sandbox_spec: spec,
    generated_at: "2026-01-01T00:00:00Z",
  },
  session: { id: "sess1", version: 1, status: "in_progress", completed_step_ids: [], responses: {}, reflection_answers: [], hints_used: 0 },
  cache_status: "miss",
};

describe("GenerationPending", () => {
  it("shows a skeleton and reassuring copy while generation is in flight", () => {
    render(<GenerationPending title="Newton's Lab" onCancel={vi.fn()} />);
    const screenEl = screen.getByTestId("generation-pending");
    expect(screenEl).toBeTruthy();
    expect(screen.getByTestId("skeleton")).toBeTruthy();
    expect(screen.getByText(/shaping this lesson around your interests/i)).toBeTruthy();
    expect(screen.getByText("Newton's Lab")).toBeTruthy();
  });

  it("swaps to an error state with a retry action", async () => {
    const onRetry = vi.fn();
    render(<GenerationPending title="Newton's Lab" error="Generation failed" onRetry={onRetry} onCancel={vi.fn()} />);
    expect(screen.getByTestId("generation-pending")).toBeTruthy();
    expect(screen.getByText("Generation failed")).toBeTruthy();
    expect(screen.queryByTestId("skeleton")).toBeNull();

    const { default: userEvent } = await import("@testing-library/user-event");
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe("GenerationGate", () => {
  it("hands the ready sandbox to onReady when the launch is immediately available", async () => {
    const launch = vi.fn(async () => readyLaunch);
    const status = vi.fn<(id: string, signal?: AbortSignal) => Promise<GenerationStatus>>();
    const onReady = vi.fn();
    render(
      <GenerationGate assignmentId="a1" assignmentTitle="Lab" launch={launch} status={status} onReady={onReady} onCancel={vi.fn()} onAuthExpired={vi.fn()} />,
    );

    await vi.waitFor(() => expect(onReady).toHaveBeenCalledWith(readyLaunch));
    expect(status).not.toHaveBeenCalled();
  });

  it("polls generation-status and re-launches once personalization completes", async () => {
    vi.useFakeTimers();
    try {
      const launch = vi.fn()
        .mockRejectedValueOnce(new ApiError("still generating", { status: 202 }))
        .mockResolvedValueOnce(readyLaunch);
      const status = vi.fn(async () => "completed" as GenerationStatus);
      const onReady = vi.fn();
      render(
        <GenerationGate assignmentId="a1" assignmentTitle="Lab" launch={launch} status={status} onReady={onReady} onCancel={vi.fn()} onAuthExpired={vi.fn()} />,
      );

      await vi.advanceTimersByTimeAsync(2000);

      expect(status).toHaveBeenCalledWith("a1", expect.anything());
      expect(onReady).toHaveBeenCalledWith(readyLaunch);
      expect(launch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces a clear error when the launch fails outright", async () => {
    const launch = vi.fn(async () => { throw new ApiError("Boom", { status: 500 }); });
    const status = vi.fn<(id: string, signal?: AbortSignal) => Promise<GenerationStatus>>();
    render(
      <GenerationGate assignmentId="a1" assignmentTitle="Lab" launch={launch} status={status} onReady={vi.fn()} onCancel={vi.fn()} onAuthExpired={vi.fn()} />,
    );

    expect(await screen.findByText("Boom")).toBeTruthy();
    expect(status).not.toHaveBeenCalled();
  });
});
