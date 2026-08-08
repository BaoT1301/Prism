import { useId, useMemo } from "react";

import type { FormulaDefinition } from "../../features/sandbox/formula-registry";
import { buildRelationshipCurve, type GraphGeometry, type RunSnapshot } from "../../features/sandbox/relationship-graph";
import type { SandboxVariable } from "../../features/sandbox/sandbox-types";

const GEOMETRY: GraphGeometry = { width: 640, height: 240, padding: { top: 22, right: 24, bottom: 40, left: 56 } };
const SAMPLE_COUNT = 56;

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 100000 || abs < 0.01)) return value.toExponential(1);
  return String(Math.round(value * 100) / 100);
}

export function RelationshipGraph({
  formula,
  variables,
  values,
  result,
  sweptId,
  onSweptChange,
  runs,
}: {
  formula: FormulaDefinition;
  variables: SandboxVariable[];
  values: Record<string, number>;
  result: number;
  sweptId: string;
  onSweptChange: (id: string) => void;
  runs: RunSnapshot[];
}) {
  const titleId = useId();
  const descId = useId();

  const sweepableIds = useMemo(() => {
    const declared = new Set(variables.map((variable) => variable.id));
    const inputs = formula.inputs.filter((id) => declared.has(id));
    return inputs.length > 0 ? inputs : variables.map((variable) => variable.id);
  }, [formula.inputs, variables]);

  const activeId = sweepableIds.includes(sweptId) ? sweptId : sweepableIds[0];
  const sweptVariable = variables.find((variable) => variable.id === activeId);

  const curve = useMemo(() => {
    const min = sweptVariable?.min ?? 0;
    const max = sweptVariable?.max ?? 1;
    const compute = (x: number) => {
      try {
        return formula.compute({ ...values, [activeId]: x });
      } catch {
        return 0;
      }
    };
    const relevantRuns = runs.filter((run) => Number.isFinite(run.values[activeId]) && run.sweptId === activeId);
    return buildRelationshipCurve({
      min,
      max,
      samples: SAMPLE_COUNT,
      compute,
      operating: { x: values[activeId] ?? min, y: Number.isFinite(result) ? result : 0 },
      runs: relevantRuns.map((run) => ({ x: run.values[activeId], y: run.result })),
      runIds: relevantRuns.map((run) => run.id),
      geometry: GEOMETRY,
    });
  }, [activeId, formula, result, runs, sweptVariable, values]);

  const { padding, width, height } = GEOMETRY;
  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  const outputName = formula.output.label;
  const sweepName = sweptVariable?.label ?? activeId;
  const sweepUnit = sweptVariable?.unit ?? "";
  const description = `${outputName} in ${formula.output.unit} as ${sweepName} sweeps from ${formatNumber(curve.bounds.xMin)} to ${formatNumber(curve.bounds.xMax)} ${sweepUnit}. Current operating point: ${sweepName} ${formatNumber(values[activeId] ?? 0)} ${sweepUnit}, ${outputName} ${formatNumber(result)} ${formula.output.unit}. ${runs.length} prior run${runs.length === 1 ? "" : "s"} plotted.`;

  const labelLeft = curve.operating.x > width - 150;
  const operatingLabelX = labelLeft ? curve.operating.x - 12 : curve.operating.x + 12;

  return (
    <section className="relationship-panel" data-testid="relationship-graph">
      <div className="section-heading">
        <div>
          <p className="card-kicker">Relationship graph</p>
          <h2>How {outputName.toLowerCase()} responds</h2>
        </div>
        {sweepableIds.length > 1 && (
          <div className="sweep-toggle" role="group" aria-label="Choose which variable to sweep">
            <span className="sweep-label">Sweep</span>
            {sweepableIds.map((id) => {
              const variable = variables.find((item) => item.id === id);
              return (
                <button
                  key={id}
                  type="button"
                  className={id === activeId ? "is-active" : ""}
                  aria-pressed={id === activeId}
                  data-testid={`sweep-${id}`}
                  onClick={() => onSweptChange(id)}
                >
                  {variable?.label ?? id}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <svg className="relationship-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={titleId} aria-describedby={descId}>
        <title id={titleId}>{outputName} versus {sweepName}</title>
        <desc id={descId}>{description}</desc>

        {gridLines.map((fraction) => {
          const y = padding.top + (1 - fraction) * (height - padding.top - padding.bottom);
          const value = curve.bounds.yMin + fraction * (curve.bounds.yMax - curve.bounds.yMin);
          return (
            <g key={fraction}>
              <line className="graph-grid" x1={padding.left} y1={y} x2={width - padding.right} y2={y} />
              <text className="graph-axis-label" x={padding.left - 10} y={y + 4} textAnchor="end">{formatNumber(value)}</text>
            </g>
          );
        })}

        {/* Axis frame */}
        <line className="graph-axis" x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} />
        <line className="graph-axis" x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} />

        <path className="graph-area" d={curve.areaPath} />
        <polyline className="graph-curve" points={curve.polyline} />

        {/* Prior runs as faded comparison points */}
        {curve.runPoints.map(({ id, point }) => (
          <circle className="graph-run-point" key={id} cx={point.x} cy={point.y} r="4.5" />
        ))}

        {/* Live operating point with crosshair */}
        <line className="graph-crosshair" x1={curve.operating.x} y1={padding.top} x2={curve.operating.x} y2={height - padding.bottom} />
        <circle className="graph-operating-halo" cx={curve.operating.x} cy={curve.operating.y} r="9" />
        <circle className="graph-operating" cx={curve.operating.x} cy={curve.operating.y} r="5" />
        <text className="graph-operating-label" x={operatingLabelX} y={Math.max(padding.top + 12, curve.operating.y - 12)} textAnchor={labelLeft ? "end" : "start"}>
          {formatNumber(result)} {formula.output.unit}
        </text>

        {/* X-axis range labels */}
        <text className="graph-axis-label" x={padding.left} y={height - padding.bottom + 22} textAnchor="start">{formatNumber(curve.bounds.xMin)}</text>
        <text className="graph-axis-label" x={width - padding.right} y={height - padding.bottom + 22} textAnchor="end">{formatNumber(curve.bounds.xMax)}</text>
        <text className="graph-axis-title" x={(padding.left + width - padding.right) / 2} y={height - 8} textAnchor="middle">{sweepName}{sweepUnit ? ` (${sweepUnit})` : ""}</text>
      </svg>

      <p className="graph-legend">
        <span className="legend-swatch legend-curve" aria-hidden="true" /> Live sweep
        <span className="legend-swatch legend-now" aria-hidden="true" /> Now
        <span className="legend-swatch legend-run" aria-hidden="true" /> Past runs
      </p>
    </section>
  );
}
