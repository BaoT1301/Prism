import { useMemo } from "react";
import { calculateFormula } from "../../features/sandbox/formula-registry";
import type { SandboxSpec } from "../../features/sandbox/sandbox-types";

export function PhysicsScene({ spec, values, runToken }: { spec: SandboxSpec; values: Record<string, number>; runToken: number }) {
  const mass = values.mass ?? 0;
  const acceleration = values.acceleration ?? 0;
  const maxMass = spec.variables.find((variable) => variable.id === "mass")?.max ?? 1;
  const maxAcceleration = spec.variables.find((variable) => variable.id === "acceleration")?.max ?? 1;
  const force = calculateFormula(spec.formula_id, values);
  const maxForce = maxMass * maxAcceleration || 1;
  const position = 80 + Math.min(440, (acceleration / maxAcceleration) * 440);
  const arrowLength = 35 + Math.min(180, (force / maxForce) * 180);
  const theme = spec.visual_theme ?? "basketball";
  const objectLabel = useMemo(() => ({ basketball: "Basketball", formula1: "F1 car", space: "Rocket" }[theme]), [theme]);
  const trail = [position - 70, position - 42, position - 18].filter((point) => point > 45);

  return <section className={`physics-scene theme-${theme}`} aria-label={`${objectLabel} physics visualization`}>
    <div className="scene-heading"><div><p className="card-kicker">Live simulation</p><h2>{objectLabel} in motion</h2></div><span className="scene-badge">{runToken ? "Experiment running" : "Ready to launch"}</span></div>
    <svg key={runToken} viewBox="0 0 640 190" role="img" aria-label={`${objectLabel} moving with acceleration ${acceleration} and force ${force}`}>
      <defs><marker id={`force-arrow-${theme}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="currentColor" /></marker></defs>
      <rect className="scene-ground" x="20" y="145" width="600" height="8" rx="4" /><path className="scene-track" d="M20 153 C180 137 300 166 620 143" />
      {trail.map((point, index) => <circle className="motion-trail" key={`${point}-${index}`} cx={point} cy={theme === "space" ? 105 : 120} r={10 - index * 2} />)}
      <g className={`moving-object ${runToken ? "is-running" : ""}`} transform={`translate(${position}, 0)`}>
        {theme === "basketball" && <><circle cx="0" cy="120" r="24" /><path className="ball-line" d="M-20 108 Q0 120 20 108 M-20 132 Q0 120 20 132 M0 96 Q-10 120 0 144" /></>}
        {theme === "formula1" && <><rect x="-42" y="105" width="84" height="28" rx="10" /><path className="car-wing" d="M-49 108 L-32 98 L30 98 L49 108" /><circle cx="-26" cy="137" r="9" /><circle cx="26" cy="137" r="9" /></>}
        {theme === "space" && <><path d="M0 78 L23 130 L0 122 L-23 130 Z" /><path className="rocket-flame" d="M-10 124 L0 151 L10 124 Z" /></>}
      </g>
      <line className="force-arrow" x1={position + 28} y1="72" x2={position + 28 + arrowLength} y2="72" markerEnd={`url(#force-arrow-${theme})`} /><text className="force-label" x={Math.min(position + 35, 485)} y="57">Force: {force.toFixed(2)} N</text>
    </svg>
    <div className="scene-readout"><span>Mass <strong>{mass}</strong> kg</span><span>Acceleration <strong>{acceleration}</strong> m/s²</span><span className="readout-force">Force <strong>{force.toFixed(2)}</strong> N</span></div>
  </section>;
}
