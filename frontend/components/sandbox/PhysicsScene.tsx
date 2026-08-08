import { useEffect, useMemo, useRef, useState } from "react";
import { calculateFormula, getFormulaDefinition } from "../../features/sandbox/formula-registry";
import type { SandboxSpec, SandboxVariable, VisualTheme } from "../../features/sandbox/sandbox-types";

const ANIMATION_DURATION_MS = 950;

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 0→1 position of a value within a variable's declared range. */
function fractionOf(value: number | undefined, variable: SandboxVariable | undefined): number {
  if (variable === undefined || value === undefined || variable.max === variable.min) return 0;
  return clamp((value - variable.min) / (variable.max - variable.min), 0, 1);
}

interface SceneSubject {
  subject: string;
  caption: string;
}

const SUBJECTS: Record<VisualTheme, SceneSubject> = {
  basketball: { subject: "Basketball", caption: "a pass down the court" },
  formula1: { subject: "F1 car", caption: "the launch out of a corner" },
  space: { subject: "Rocket", caption: "the climb off the pad" },
  sprint: { subject: "Sprinter", caption: "energy building with speed" },
  collision: { subject: "Rolling cart", caption: "momentum into the bumper" },
  circuit: { subject: "Circuit", caption: "current lighting the lamp" },
  pulley: { subject: "Pulley lift", caption: "work raising the crate" },
};

const PROJECTILE_THEMES: VisualTheme[] = ["basketball", "formula1", "space"];

interface SceneContext {
  motion: number;
  intensity: number;
  fractions: Record<string, number>;
  values: Record<string, number>;
  outputValue: number;
  outputLabel: string;
  outputUnit: string;
  theme: VisualTheme;
}

export function PhysicsScene({ spec, values, runToken }: { spec: SandboxSpec; values: Record<string, number>; runToken: number }) {
  const formula = useMemo(() => getFormulaDefinition(spec.formula_id), [spec.formula_id]);
  const theme = spec.visual_theme ?? "basketball";
  const subject = SUBJECTS[theme] ?? SUBJECTS.basketball;

  // The scene describes the last *executed* run, not half-dragged sliders, so the
  // numbers, motion, and readout always agree on one internally consistent frame.
  const [runValues, setRunValues] = useState(values);
  const [motion, setMotion] = useState(1);
  const [isRunning, setIsRunning] = useState(false);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const maxOutput = useMemo(() => {
    try {
      const atMax = Object.fromEntries(spec.variables.map((variable) => [variable.id, variable.max]));
      const value = Math.abs(formula.compute(atMax));
      return value > 0 ? value : 1;
    } catch {
      return 1;
    }
  }, [formula, spec.variables]);

  let outputValue = 0;
  try {
    outputValue = calculateFormula(spec.formula_id, runValues);
  } catch {
    outputValue = 0;
  }
  const intensity = clamp(Math.abs(outputValue) / maxOutput, 0, 1);
  const fractions = Object.fromEntries(spec.variables.map((variable) => [variable.id, fractionOf(runValues[variable.id], variable)]));

  useEffect(() => {
    if (runToken === 0) return;
    // `values` read through the ref intentionally — a run only fires on click.
    const snapshot = valuesRef.current;
    setRunValues(snapshot);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMotion(1);
      setIsRunning(false);
      return;
    }

    if (animationFrameRef.current !== undefined) window.cancelAnimationFrame(animationFrameRef.current);
    const startTime = performance.now();
    setMotion(0);
    setIsRunning(true);

    function animate(currentTime: number) {
      const progress = Math.min(1, (currentTime - startTime) / ANIMATION_DURATION_MS);
      setMotion(easeOutCubic(progress));
      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(animate);
      } else {
        animationFrameRef.current = undefined;
        setIsRunning(false);
      }
    }

    animationFrameRef.current = window.requestAnimationFrame(animate);
    return () => { if (animationFrameRef.current !== undefined) window.cancelAnimationFrame(animationFrameRef.current); };
  }, [runToken]);

  useEffect(() => () => { if (animationFrameRef.current !== undefined) window.cancelAnimationFrame(animationFrameRef.current); }, []);

  const context: SceneContext = {
    motion,
    intensity,
    fractions,
    values: runValues,
    outputValue,
    outputLabel: formula.output.label,
    outputUnit: formula.output.unit,
    theme,
  };

  const ariaSummary = `${subject.subject} scene. ${formula.output.label} ${outputValue.toFixed(2)} ${formula.output.unit}.`;

  return (
    <section className={`physics-scene theme-${theme}`} aria-label={`${subject.subject} simulation for ${formula.label}`}>
      <div className="scene-heading">
        <div>
          <p className="card-kicker">Live simulation</p>
          <h2>{subject.subject}</h2>
        </div>
        <span className="scene-badge">{isRunning ? "Experiment running" : "Ready to launch"}</span>
      </div>
      <svg viewBox="0 0 640 200" role="img" aria-label={ariaSummary}>
        <defs>
          <marker id={`scene-arrow-${theme}`} markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="currentColor" /></marker>
        </defs>
        {renderScene(context)}
      </svg>
      <div className="scene-readout">
        {formula.inputs.map((inputId) => {
          const variable = spec.variables.find((item) => item.id === inputId);
          return (
            <span key={inputId}>{variable?.label ?? inputId} <strong>{runValues[inputId]}</strong> {variable?.unit ?? ""}</span>
          );
        })}
        <span className="readout-force">{formula.output.label} <strong>{outputValue.toFixed(2)}</strong> {formula.output.unit}</span>
      </div>
    </section>
  );
}

function renderScene(ctx: SceneContext) {
  if (PROJECTILE_THEMES.includes(ctx.theme)) return renderProjectile(ctx);
  if (ctx.theme === "sprint") return renderSprint(ctx);
  if (ctx.theme === "collision") return renderCollision(ctx);
  if (ctx.theme === "circuit") return renderCircuit(ctx);
  if (ctx.theme === "pulley") return renderPulley(ctx);
  return renderProjectile(ctx);
}

function outputArrowLabel(ctx: SceneContext): string {
  return `${ctx.outputLabel}: ${ctx.outputValue.toFixed(2)} ${ctx.outputUnit}`;
}

function renderProjectile(ctx: SceneContext) {
  const reach = 40 + ctx.intensity * 330;
  const x = 70 + ctx.motion * reach;
  const arrowLength = 26 + ctx.intensity * 150;
  const arrowEnd = Math.min(x + 30 + arrowLength, 612);
  const trail = [x - 74, x - 46, x - 22].filter((point) => point > 44);
  return (
    <>
      <rect className="scene-ground" x="20" y="150" width="600" height="8" rx="4" />
      <path className="scene-track" d="M20 158 C180 142 300 170 620 148" />
      {trail.map((point, index) => <circle className="motion-trail" key={`${point}-${index}`} cx={point} cy={ctx.theme === "space" ? 104 : 118} r={11 - index * 2.5} />)}
      <g className="moving-object" transform={`translate(${x}, 0)`}>
        {ctx.theme === "basketball" && <><circle cx="0" cy="118" r="22" /><path className="ball-line" d="M-19 107 Q0 118 19 107 M-19 129 Q0 118 19 129 M0 96 Q-9 118 0 140" /></>}
        {ctx.theme === "formula1" && <><rect x="-40" y="104" width="80" height="26" rx="9" /><path className="car-wing" d="M-47 108 L-30 98 L28 98 L47 108" /><circle cx="-24" cy="133" r="9" /><circle cx="24" cy="133" r="9" /></>}
        {ctx.theme === "space" && <><path d="M0 78 L21 128 L0 120 L-21 128 Z" /><path className="rocket-flame" d="M-9 122 L0 148 L9 122 Z" /></>}
      </g>
      <line className="force-arrow" x1={x + 30} y1="70" x2={arrowEnd} y2="70" markerEnd={`url(#scene-arrow-${ctx.theme})`} />
      <text className="force-label" x={Math.min(x + 34, 470)} y="56">{outputArrowLabel(ctx)}</text>
    </>
  );
}

function renderSprint(ctx: SceneContext) {
  const velFrac = ctx.fractions.velocity ?? ctx.intensity;
  const reach = 60 + velFrac * 300;
  const x = 70 + ctx.motion * reach;
  const ringRadius = 24 + ctx.intensity * 46;
  const speedLines = [0, 1, 2, 3].filter((index) => index <= velFrac * 4 + 0.5);
  return (
    <>
      <rect className="scene-ground" x="20" y="150" width="600" height="8" rx="4" />
      <path className="scene-track" d="M20 160 L620 160" />
      {[130, 140].map((y) => <line className="lane-line" key={y} x1="20" y1={y} x2="620" y2={y} />)}
      <g className="energy-burst" transform={`translate(${x}, 108)`} style={{ opacity: 0.15 + ctx.intensity * 0.55 }}>
        <circle className="spark-ring" r={ringRadius} />
        <circle className="spark-ring" r={ringRadius * 0.62} />
      </g>
      {speedLines.map((index) => <line className="speed-line" key={index} x1={x - 34 - index * 16} y1={94 + index * 10} x2={x - 12 - index * 16} y2={94 + index * 10} style={{ opacity: 0.65 - index * 0.12 }} />)}
      <g className="scene-runner" transform={`translate(${x}, 0)`}>
        <circle cx="4" cy="86" r="9" />
        <path className="runner-body" d="M4 95 L-3 118" />
        <path className="runner-limb" d="M-3 118 L-16 132 M-3 118 L12 130" />
        <path className="runner-limb" d="M1 102 L16 96 M1 102 L-12 108" />
      </g>
      <line className="force-arrow" x1={x + 22} y1="72" x2={Math.min(x + 22 + (30 + ctx.intensity * 150), 612)} y2="72" markerEnd={`url(#scene-arrow-${ctx.theme})`} />
      <text className="force-label" x={Math.min(x + 26, 460)} y="58">{outputArrowLabel(ctx)}</text>
    </>
  );
}

function renderCollision(ctx: SceneContext) {
  const velFrac = ctx.fractions.velocity ?? ctx.intensity;
  const targetX = 430;
  const startX = 90;
  const contactX = targetX - 96;
  const cartX = startX + ctx.motion * (contactX - startX) * (0.7 + velFrac * 0.3);
  const nudge = ctx.motion > 0.92 ? (ctx.motion - 0.92) * 220 : 0;
  const bumperX = targetX + nudge;
  const arrowLength = 26 + ctx.intensity * 150;
  return (
    <>
      <rect className="scene-ground" x="20" y="150" width="600" height="8" rx="4" />
      <path className="scene-track" d="M20 158 L620 158" />
      <g className="moving-object cart-a" transform={`translate(${cartX}, 0)`}>
        <rect x="-42" y="108" width="84" height="30" rx="8" />
        <circle cx="-24" cy="141" r="9" />
        <circle cx="24" cy="141" r="9" />
      </g>
      <g className="cart-b" transform={`translate(${bumperX}, 0)`}>
        <rect x="-30" y="112" width="60" height="26" rx="7" />
        <circle cx="-16" cy="141" r="8" />
        <circle cx="16" cy="141" r="8" />
      </g>
      <line className="force-arrow" x1={bumperX + 36} y1="96" x2={Math.min(bumperX + 36 + arrowLength, 616)} y2="96" markerEnd={`url(#scene-arrow-${ctx.theme})`} />
      <text className="force-label" x={Math.min(cartX - 10, 300)} y="58">{outputArrowLabel(ctx)}</text>
    </>
  );
}

function renderCircuit(ctx: SceneContext) {
  const currentFrac = ctx.fractions.current ?? ctx.intensity;
  const flowDuration = `${clamp(2.6 - currentFrac * 2.1, 0.5, 2.6)}s`;
  const brightness = 0.18 + ctx.intensity * 0.82;
  const dots = [90, 205, 320, 435];
  return (
    <>
      <rect className="circuit-wire" x="90" y="50" width="460" height="100" rx="18" />
      {/* Battery on the left rail */}
      <g className="circuit-battery" transform="translate(90, 100)">
        <line x1="-8" y1="-18" x2="-8" y2="18" />
        <line className="battery-long" x1="8" y1="-11" x2="8" y2="11" />
      </g>
      {/* Resistor along the top rail */}
      <path className="circuit-resistor" d="M250 50 l10 -14 l20 28 l20 -28 l20 28 l20 -28 l10 14" />
      {/* Lamp on the right rail */}
      <g transform="translate(550, 100)">
        <circle className="lamp-glow" r={16 + ctx.intensity * 26} style={{ opacity: brightness * 0.5 }} />
        <circle className="lamp-bulb" r="15" style={{ opacity: 0.35 + brightness * 0.65 }} />
        <path className="lamp-filament" d="M-7 6 Q0 -12 7 6" />
      </g>
      <g className="circuit-current" style={{ animationDuration: flowDuration }}>
        {dots.map((cx) => <circle className="circuit-dot" key={`top-${cx}`} cx={cx} cy="50" r="4.5" />)}
      </g>
      <g className="circuit-current circuit-current-return" style={{ animationDuration: flowDuration }}>
        {dots.map((cx) => <circle className="circuit-dot" key={`bottom-${cx}`} cx={cx} cy="150" r="4.5" />)}
      </g>
      <text className="force-label" x="250" y="182">{outputArrowLabel(ctx)}</text>
    </>
  );
}

function renderPulley(ctx: SceneContext) {
  const distFrac = ctx.fractions.distance ?? ctx.intensity;
  const forceFrac = ctx.fractions.force ?? ctx.intensity;
  const lift = 24 + distFrac * 92;
  const crateTop = 150 - ctx.motion * lift;
  const pullEndY = 70 + ctx.motion * lift;
  const workFill = 4 + ctx.intensity * 118;
  return (
    <>
      <rect className="scene-ground" x="20" y="150" width="600" height="8" rx="4" />
      <rect className="pulley-beam" x="150" y="34" width="340" height="12" rx="4" />
      <circle className="pulley-wheel" cx="360" cy="58" r="16" />
      <circle className="pulley-hub" cx="360" cy="58" r="4" />
      {/* Rope: crate side up over the wheel, then down to the pulled free end */}
      <path className="pulley-rope" d={`M300 ${crateTop} L300 58 Q300 42 344 58 L344 58`} />
      <line className="pulley-rope" x1="376" y1="58" x2="376" y2={pullEndY} />
      <line className="force-arrow" x1="376" y1={pullEndY} x2="376" y2={pullEndY + (24 + forceFrac * 60)} markerEnd={`url(#scene-arrow-${ctx.theme})`} />
      <g className="crate" transform={`translate(300, ${crateTop})`}>
        <rect x="-34" y="0" width="68" height="52" rx="6" />
        <path className="crate-grain" d="M-34 18 L34 18 M-34 34 L34 34 M0 0 L0 52" />
      </g>
      {/* Work meter climbs with the output */}
      <g transform="translate(560, 40)">
        <rect className="work-meter" x="0" y="0" width="18" height="118" rx="6" />
        <rect className="work-fill" x="0" y={118 - workFill} width="18" height={workFill} rx="6" />
      </g>
      <text className="force-label" x="150" y="182">{outputArrowLabel(ctx)}</text>
    </>
  );
}
