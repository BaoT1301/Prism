import type { GuidedStep, ProgressRequest, ReflectionAnswer, SandboxSession } from "./sandbox-types";

export function progressPercentage(steps: GuidedStep[], completedStepIds: string[]): number {
  if (steps.length === 0) return 0;
  const validIds = new Set(steps.map((step) => step.id));
  const completed = new Set(completedStepIds.filter((id) => validIds.has(id)));
  return Math.round((completed.size / steps.length) * 100);
}

export function buildProgressRequest(session: SandboxSession, completedStepIds: string[], responses: Record<string, number>, reflectionAnswers: ReflectionAnswer[]): ProgressRequest {
  return { expected_version: session.version, completed_step_ids: completedStepIds, responses, reflection_answers: reflectionAnswers };
}
