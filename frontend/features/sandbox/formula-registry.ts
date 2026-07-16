import type { FormulaId } from "./sandbox-types";

export type FormulaCalculator = (values: Record<string, number>) => number;

const calculateForce: FormulaCalculator = ({ mass, acceleration }) => {
  if (!Number.isFinite(mass) || !Number.isFinite(acceleration)) {
    throw new Error("Mass and acceleration must be finite numbers.");
  }
  return mass * acceleration;
};

export const FORMULA_REGISTRY: Record<FormulaId, FormulaCalculator> = {
  force_equals_mass_times_acceleration: calculateForce,
};

export function calculateFormula(formulaId: FormulaId, values: Record<string, number>): number {
  const calculator = FORMULA_REGISTRY[formulaId];
  if (!calculator) throw new Error(`Unsupported formula: ${formulaId}`);
  return calculator(values);
}
