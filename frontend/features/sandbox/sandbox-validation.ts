import type { SandboxSpec } from "./sandbox-types";

const unsafeMarkers = ["<script", "javascript:", "import ", "exec(", "select "];

function safeText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid sandbox ${field}.`);
  }
  const normalized = value.toLowerCase();
  if (unsafeMarkers.some((marker) => normalized.includes(marker))) {
    throw new Error("Sandbox content contains unsafe text.");
  }
  return value;
}

export function validateSandboxSpec(value: unknown): SandboxSpec {
  if (!value || typeof value !== "object") throw new Error("Sandbox specification is invalid.");
  const candidate = value as Partial<SandboxSpec>;
  if (candidate.version !== 1 || candidate.sandbox_type !== "parameter_explorer") {
    throw new Error("Unsupported sandbox type or version.");
  }
  safeText(candidate.title, "title");
  safeText(candidate.introduction, "introduction");
  if (candidate.formula_id !== "force_equals_mass_times_acceleration") {
    throw new Error("Unsupported sandbox formula.");
  }
  if (candidate.visual_theme && !["basketball", "formula1", "space"].includes(candidate.visual_theme)) {
    throw new Error("Unsupported sandbox visual theme.");
  }
  if (!Array.isArray(candidate.variables) || candidate.variables.length < 2 || candidate.variables.length > 4) {
    throw new Error("Sandbox must contain between two and four variables.");
  }
  const variableIds = new Set<string>();
  for (const variable of candidate.variables) {
    safeText(variable.id, "variable id");
    safeText(variable.label, "variable label");
    if (variableIds.has(variable.id)) throw new Error("Sandbox variable IDs must be unique.");
    variableIds.add(variable.id);
    if (![variable.min, variable.max, variable.step, variable.default].every(Number.isFinite)) {
      throw new Error("Sandbox variable values must be finite numbers.");
    }
    if (variable.min > variable.max || variable.step <= 0 || variable.default < variable.min || variable.default > variable.max) {
      throw new Error("Sandbox variable range is invalid.");
    }
  }
  if (!Array.isArray(candidate.guided_steps) || candidate.guided_steps.length < 2 || candidate.guided_steps.length > 8) {
    throw new Error("Sandbox must contain between two and eight guided steps.");
  }
  const stepIds = new Set<string>();
  for (const step of candidate.guided_steps) {
    safeText(step.id, "step id");
    safeText(step.instruction, "step instruction");
    if (stepIds.has(step.id)) throw new Error("Guided-step IDs must be unique.");
    stepIds.add(step.id);
    for (const check of step.completion_checks ?? []) {
      if (!["value_changed", "value_increased", "value_decreased", "reflection_answered"].includes(check.type)) {
        throw new Error("Sandbox completion check is unsupported.");
      }
      if (check.type === "reflection_answered" && !check.question_id) throw new Error("Reflection checks require a question ID.");
      if (check.type !== "reflection_answered" && !check.variable_id) throw new Error("Value checks require a variable ID.");
      if (check.variable_id && !variableIds.has(check.variable_id)) throw new Error("Completion check references an unknown variable.");
    }
  }
  if (!Array.isArray(candidate.completion_rules) || candidate.completion_rules.length < 1) {
    throw new Error("Sandbox completion rules are required.");
  }
  for (const rule of candidate.completion_rules) {
    if (!["step_completed", "all_steps_completed", "reflection_answered"].includes(rule.type)) {
      throw new Error("Sandbox completion rule is unsupported.");
    }
    if (rule.step_id !== undefined && rule.step_id !== null && !stepIds.has(rule.step_id)) {
      throw new Error("Completion rule references an unknown step.");
    }
  }
  const questions = candidate.reflection_questions ?? [];
  if (!Array.isArray(questions) || questions.length > 5) throw new Error("Reflection questions are invalid.");
  for (const question of questions) {
    safeText(question.id, "reflection question id");
    safeText(question.question, "reflection question");
  }
  const questionIds = new Set(questions.map((question) => question.id));
  for (const step of candidate.guided_steps) {
    for (const check of step.completion_checks ?? []) {
      if (check.question_id && !questionIds.has(check.question_id)) throw new Error("Completion check references an unknown question.");
    }
  }
  const mission = candidate.mission;
  if (mission === undefined) return { ...candidate, reflection_questions: questions } as SandboxSpec;
  if (mission.schema_version !== "1.0" || mission.evaluator_version !== "numeric-v1") throw new Error("Sandbox mission is invalid.");
  if (!mission.title || !mission.context || !mission.objective || !mission.template_id) throw new Error("Sandbox mission content is incomplete.");
  if (!Array.isArray(mission.controls) || mission.controls.length === 0 || mission.controls.some((control) => !variableIds.has(control.variable_id))) throw new Error("Mission controls reference unknown variables.");
  if (!Array.isArray(mission.calculated_outputs) || !mission.calculated_outputs.some((output) => output.id === "force" && output.formula_id === candidate.formula_id)) throw new Error("Mission outputs are invalid.");
  if (!Array.isArray(mission.visible_constraints) || mission.visible_constraints.length === 0) throw new Error("Mission constraints are required.");
  const constraintIds = new Set<string>();
  for (const constraint of mission.visible_constraints) {
    if (!constraint.id || constraintIds.has(constraint.id) || !constraint.label || !variableIds.has(constraint.field) && constraint.field !== "force") throw new Error("Mission constraint reference is invalid.");
    constraintIds.add(constraint.id);
    if (!["greater_than_or_equal", "less_than_or_equal", "between"].includes(constraint.operator)) throw new Error("Mission constraint operator is unsupported.");
    if (constraint.operator === "between" && (typeof constraint.min !== "number" || typeof constraint.max !== "number" || constraint.min > constraint.max)) throw new Error("Mission constraint range is invalid.");
    if (constraint.operator !== "between" && typeof constraint.value !== "number") throw new Error("Mission constraint threshold is invalid.");
  }
  if (mission.success_condition?.operator !== "AND" || !mission.success_condition.constraint_ids.length || mission.success_condition.constraint_ids.some((id) => !constraintIds.has(id))) throw new Error("Mission success condition is invalid.");
  if (!mission.bonus_condition || mission.bonus_condition.type !== "distinct_second_solution") throw new Error("Mission bonus condition is invalid.");
  return { ...candidate, reflection_questions: questions } as SandboxSpec;
}
