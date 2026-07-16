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
