import type { FormulaDefinition } from "../../features/sandbox/formula-registry";
import type { RunSnapshot } from "../../features/sandbox/relationship-graph";
import type { SandboxVariable } from "../../features/sandbox/sandbox-types";

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 100000 || abs < 0.01)) return value.toExponential(1);
  return String(Math.round(value * 100) / 100);
}

export function RunHistory({
  runs,
  formula,
  variables,
  onClear,
}: {
  runs: RunSnapshot[];
  formula: FormulaDefinition;
  variables: SandboxVariable[];
  onClear: () => void;
}) {
  const ordered = [...runs].reverse();
  return (
    <section className="run-history" data-testid="run-history">
      <div className="run-history-head">
        <div>
          <p className="card-kicker">Compare runs</p>
          <h2>Run history</h2>
        </div>
        <button
          type="button"
          className="text-button"
          data-testid="clear-runs"
          disabled={runs.length === 0}
          onClick={onClear}
        >
          Clear
        </button>
      </div>
      {runs.length === 0 ? (
        <p className="run-history-empty">Run the experiment to snapshot a result. Snapshots appear here and as faded points on the graph.</p>
      ) : (
        <ol className="run-history-list">
          {ordered.map((run, index) => (
            <li key={run.id} data-testid={`run-item-${run.id}`}>
              <span className="run-index">#{runs.length - index}</span>
              <span className="run-inputs">
                {formula.inputs.map((inputId) => {
                  const variable = variables.find((item) => item.id === inputId);
                  return (
                    <span className="run-chip" key={inputId}>
                      {variable?.label ?? inputId}: <strong>{formatNumber(run.values[inputId])}</strong>{variable?.unit ? ` ${variable.unit}` : ""}
                    </span>
                  );
                })}
              </span>
              <span className="run-result">{formatNumber(run.result)} <small>{formula.output.unit}</small></span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
