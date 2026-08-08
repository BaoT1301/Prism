import type { FormulaId } from "./sandbox-types";

export type FormulaCalculator = (values: Record<string, number>) => number;

export interface FormulaOutput {
  /** Human noun for the computed quantity, e.g. "Force". */
  label: string;
  /** SI unit the output is expressed in, e.g. "N". */
  unit: string;
}

export interface FormulaDefinition {
  id: FormulaId;
  /** Human label for the relationship, e.g. "Newton's second law". */
  label: string;
  /** Compact symbolic form for editorial display, e.g. "F = m · a". */
  expression: string;
  output: FormulaOutput;
  /** Variable ids this formula consumes, in reading order. */
  inputs: string[];
  /** Pure computation over a values map keyed by the input ids. */
  compute: FormulaCalculator;
}

/** Throws unless every required input resolves to a finite number. */
function requireFinite(values: Record<string, number>, keys: string[]): number[] {
  return keys.map((key) => {
    const value = values[key];
    if (!Number.isFinite(value)) {
      throw new Error(`Variable "${key}" must be a finite number.`);
    }
    return value;
  });
}

export const FORMULA_DEFINITIONS: Record<FormulaId, FormulaDefinition> = {
  force_equals_mass_times_acceleration: {
    id: "force_equals_mass_times_acceleration",
    label: "Newton's second law",
    expression: "F = m · a",
    output: { label: "Force", unit: "N" },
    inputs: ["mass", "acceleration"],
    compute: (values) => {
      const [mass, acceleration] = requireFinite(values, ["mass", "acceleration"]);
      return mass * acceleration;
    },
  },
  kinetic_energy: {
    id: "kinetic_energy",
    label: "Kinetic energy",
    expression: "KE = ½ · m · v²",
    output: { label: "Energy", unit: "J" },
    inputs: ["mass", "velocity"],
    compute: (values) => {
      const [mass, velocity] = requireFinite(values, ["mass", "velocity"]);
      return 0.5 * mass * velocity * velocity;
    },
  },
  momentum: {
    id: "momentum",
    label: "Linear momentum",
    expression: "p = m · v",
    output: { label: "Momentum", unit: "kg·m/s" },
    inputs: ["mass", "velocity"],
    compute: (values) => {
      const [mass, velocity] = requireFinite(values, ["mass", "velocity"]);
      return mass * velocity;
    },
  },
  ohms_law: {
    id: "ohms_law",
    label: "Ohm's law",
    expression: "V = I · R",
    output: { label: "Voltage", unit: "V" },
    inputs: ["current", "resistance"],
    compute: (values) => {
      const [current, resistance] = requireFinite(values, ["current", "resistance"]);
      return current * resistance;
    },
  },
  work_done: {
    id: "work_done",
    label: "Work done",
    expression: "W = F · d",
    output: { label: "Work", unit: "J" },
    inputs: ["force", "distance"],
    compute: (values) => {
      const [force, distance] = requireFinite(values, ["force", "distance"]);
      return force * distance;
    },
  },
};

/** Calculator-only view of the registry, preserved for existing call sites. */
export const FORMULA_REGISTRY: Record<FormulaId, FormulaCalculator> = Object.fromEntries(
  (Object.keys(FORMULA_DEFINITIONS) as FormulaId[]).map((id) => [id, FORMULA_DEFINITIONS[id].compute]),
) as Record<FormulaId, FormulaCalculator>;

export function getFormulaDefinition(formulaId: FormulaId): FormulaDefinition {
  const definition = FORMULA_DEFINITIONS[formulaId];
  if (!definition) throw new Error(`Unsupported formula: ${formulaId}`);
  return definition;
}

export function isFormulaId(value: unknown): value is FormulaId {
  return typeof value === "string" && value in FORMULA_DEFINITIONS;
}

export function calculateFormula(formulaId: FormulaId, values: Record<string, number>): number {
  return getFormulaDefinition(formulaId).compute(values);
}
