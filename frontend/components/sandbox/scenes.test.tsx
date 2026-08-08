// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import basketball from "../../features/sandbox/fixtures/basketball.json";
import kineticEnergy from "../../features/sandbox/fixtures/kinetic-energy.json";
import momentum from "../../features/sandbox/fixtures/momentum.json";
import ohmsLaw from "../../features/sandbox/fixtures/ohms-law.json";
import workDone from "../../features/sandbox/fixtures/work-done.json";
import { calculateFormula, getFormulaDefinition } from "../../features/sandbox/formula-registry";
import { validateSandboxSpec } from "../../features/sandbox/sandbox-validation";
import { PhysicsScene } from "./PhysicsScene";
import { RelationshipGraph } from "./RelationshipGraph";

const SPECS = [basketball, kineticEnergy, momentum, ohmsLaw, workDone].map((raw) => validateSandboxSpec(raw));

describe("scene + graph rendering", () => {
  it.each(SPECS)("renders the $visual_theme scene and live graph without throwing", (spec) => {
    const values = Object.fromEntries(spec.variables.map((variable) => [variable.id, variable.default]));
    const formula = getFormulaDefinition(spec.formula_id);
    const result = calculateFormula(spec.formula_id, values);

    const { unmount } = render(
      <>
        <PhysicsScene spec={spec} values={values} runToken={0} />
        <RelationshipGraph
          formula={formula}
          variables={spec.variables}
          values={values}
          result={result}
          sweptId={formula.inputs[0]}
          onSweptChange={() => {}}
          runs={[{ id: 1, values, result, sweptId: formula.inputs[0] }]}
        />
      </>,
    );

    // The scene shows the computed output; the graph exposes its testid + a polyline.
    expect(screen.getByTestId("relationship-graph")).toBeTruthy();
    expect(document.querySelector(".graph-curve")?.getAttribute("points")).toBeTruthy();
    unmount();
  });
});
