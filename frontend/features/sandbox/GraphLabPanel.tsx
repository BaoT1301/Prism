import { useMemo, useState } from "react";

export function GraphLabPanel({ values, force }: { values: Record<string, number>; force: number }) {
  const [trials, setTrials] = useState<Array<{ mass: number; acceleration: number; force: number }>>([]);
  const maxForce = useMemo(() => Math.max(1, ...trials.map((trial) => trial.force)), [trials]);

  function recordTrial() {
    const trial = { mass: values.mass ?? 0, acceleration: values.acceleration ?? 0, force };
    setTrials((current) => current.some((item) => item.mass === trial.mass && item.acceleration === trial.acceleration) ? current : [...current, trial].slice(-6));
  }

  return (
    <section className="format-panel graph-lab-panel" aria-labelledby="graph-lab-title">
      <div className="section-heading"><div><p className="card-kicker">Graph lab</p><h2 id="graph-lab-title">Turn trials into evidence.</h2></div><button className="secondary-button" type="button" onClick={recordTrial}>Record this trial</button></div>
      <p className="format-panel-copy">Adjust one value, run the simulation, then record the force. Compare the bars to spot the relationship.</p>
      {trials.length ? <ol className="trial-chart" aria-label="Recorded force trials">{trials.map((trial, index) => <li key={`${trial.mass}-${trial.acceleration}`}><span className="trial-label">Trial {index + 1}<small>{trial.mass} kg · {trial.acceleration} m/s²</small></span><span className="trial-bar"><i style={{ width: `${Math.max(8, (trial.force / maxForce) * 100)}%` }} /></span><strong>{trial.force.toFixed(2)} N</strong></li>)}</ol> : <p className="format-empty">No trials yet. Record your first force measurement.</p>}
    </section>
  );
}
