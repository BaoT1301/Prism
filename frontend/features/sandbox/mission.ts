import { calculateFormula } from "./formula-registry";
import type { MissionEvaluation, SandboxSpec } from "./sandbox-types";

export function evaluateMission(spec: SandboxSpec, values: Record<string, number>): MissionEvaluation {
  const outputs = { force: calculateFormula(spec.formula_id, values) };
  const current = { ...values, ...outputs };
  const constraints = spec.mission.visible_constraints.map((constraint) => {
    const value = current[constraint.field];
    const satisfied = typeof value === "number" && (
      constraint.operator === "greater_than_or_equal" ? value >= (constraint.value ?? Infinity) :
      constraint.operator === "less_than_or_equal" ? value <= (constraint.value ?? -Infinity) :
      value >= (constraint.min ?? Infinity) && value <= (constraint.max ?? -Infinity)
    );
    return { id: constraint.id, label: constraint.label, satisfied, current_value: typeof value === "number" ? value : null, message: satisfied ? "On target" : "Adjust the experiment to meet this constraint." };
  });
  const required = new Set(spec.mission.success_condition.constraint_ids);
  return { complete: required.size > 0 && constraints.every((constraint) => !required.has(constraint.id) || constraint.satisfied), outputs, constraints, bonus: { enabled: spec.mission.bonus_condition.enabled, complete: false, attempted: false } };
}
