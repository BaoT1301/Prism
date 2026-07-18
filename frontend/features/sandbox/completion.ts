import type { ReflectionAnswer, SandboxSpec } from "./sandbox-types";

export function automaticallyCompletedStepIds(spec: SandboxSpec, responses: Record<string, number>, answers: ReflectionAnswer[]): string[] {
  const answerMap = new Map(answers.map((answer) => [answer.question_id, answer.answer.trim()]));
  return spec.guided_steps.filter((step) => {
    const checks = step.completion_checks ?? [];
    return checks.length > 0 && checks.every((check) => {
      if (check.type === "reflection_answered") return Boolean(check.question_id && answerMap.get(check.question_id));
      const variable = spec.variables.find((item) => item.id === check.variable_id);
      const value = check.variable_id ? responses[check.variable_id] : undefined;
      if (!variable || typeof value !== "number") return false;
      if (check.type === "value_changed") return value !== variable.default;
      if (check.type === "value_increased") return value > variable.default;
      if (check.type === "value_decreased") return value < variable.default;
      return false;
    });
  }).map((step) => step.id);
}

export function mergeCompletedStepIds(spec: SandboxSpec, savedIds: string[], responses: Record<string, number>, answers: ReflectionAnswer[]): string[] {
  return [...new Set([...savedIds, ...automaticallyCompletedStepIds(spec, responses, answers)])].filter((id) => spec.guided_steps.some((step) => step.id === id));
}

/** Mirrors the backend submission rules so the UI never offers an impossible submit. */
export function completionRulesSatisfied(spec: SandboxSpec, completedStepIds: string[], answers: ReflectionAnswer[]): boolean {
  if (spec.completion_rules.length === 0) return false;
  const completed = new Set(completedStepIds);
  const allSteps = spec.guided_steps.map((step) => step.id);
  const answeredQuestionIds = new Set(answers.filter((answer) => answer.answer.trim()).map((answer) => answer.question_id));
  return spec.completion_rules.every((rule) => {
    if (rule.type === "all_steps_completed") return allSteps.every((stepId) => completed.has(stepId));
    if (rule.type === "step_completed") return Boolean(rule.step_id && completed.has(rule.step_id));
    if (rule.type === "reflection_answered") return spec.reflection_questions.every((question) => answeredQuestionIds.has(question.id));
    return false;
  });
}
