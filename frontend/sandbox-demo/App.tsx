import { useEffect, useMemo, useState } from "react";
import basketball from "../features/sandbox/fixtures/basketball.json";
import kineticEnergy from "../features/sandbox/fixtures/kinetic-energy.json";
import momentum from "../features/sandbox/fixtures/momentum.json";
import ohmsLaw from "../features/sandbox/fixtures/ohms-law.json";
import workDone from "../features/sandbox/fixtures/work-done.json";
import { SandboxRenderer } from "../features/sandbox/SandboxRenderer";
import { validateSandboxSpec } from "../features/sandbox/sandbox-validation";
import type { SandboxSpec } from "../features/sandbox/sandbox-types";
import { createDemoSandboxApi, type DemoSandboxApi } from "./demo-api";
import "../styles.css";

// One fixture per canonical formula, each with its own visual theme. The option
// labels are stable and predictable so Playwright can target them directly.
const FIXTURES = [
  { name: "basketball", label: "Basketball · F = ma", spec: validateSandboxSpec(basketball) },
  { name: "kinetic-energy", label: "Sprint · Kinetic energy", spec: validateSandboxSpec(kineticEnergy) },
  { name: "momentum", label: "Collision · Momentum", spec: validateSandboxSpec(momentum) },
  { name: "ohms-law", label: "Circuit · Ohm's law", spec: validateSandboxSpec(ohmsLaw) },
  { name: "work-done", label: "Pulley · Work done", spec: validateSandboxSpec(workDone) },
] as const satisfies ReadonlyArray<{ name: string; label: string; spec: SandboxSpec }>;

const fixtureMap = Object.fromEntries(FIXTURES.map((fixture) => [fixture.name, fixture.spec])) as Record<(typeof FIXTURES)[number]["name"], SandboxSpec>;

type FixtureName = keyof typeof fixtureMap;

export function App() {
  const [fixtureName, setFixtureName] = useState<FixtureName>(FIXTURES[0].name);
  const [reloadKey, setReloadKey] = useState(0);
  const spec = fixtureMap[fixtureName];
  const api = useMemo<DemoSandboxApi>(() => createDemoSandboxApi(spec), [spec]);
  const [launch, setLaunch] = useState<Awaited<ReturnType<DemoSandboxApi["launchAssignment"]>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    setLaunch(null);
    void api.launchAssignment(`demo-${fixtureName}`).then((result) => {
      if (!cancelled) setLaunch(result);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load the sandbox.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [api, fixtureName, reloadKey]);

  function resetDemo() {
    api.reset();
    setReloadKey((key) => key + 1);
  }

  return <div className="demo-shell" data-testid="sandbox-demo"><header className="demo-header"><div><h1 className="product-title">PRISM INTERACTIVE SANDBOX</h1></div><div className="demo-controls"><label>Fixture<select value={fixtureName} data-testid="fixture-select" onChange={(event) => setFixtureName(event.target.value as FixtureName)}>{FIXTURES.map((fixture) => <option key={fixture.name} value={fixture.name}>{fixture.label}</option>)}</select></label><button type="button" data-testid="reset-demo" onClick={resetDemo}>Reset demo</button></div></header><section className="demo-status">{launch && <span data-testid="session-version">Session version: {launch.session.version}</span>}<span>Progress is saved in this browser.</span></section>{loading && <p className="center-message" role="status">Loading sandbox...</p>}{error && <p className="center-message error" role="alert">{error}</p>}{launch && <SandboxRenderer key={launch.session.id} spec={launch.assignment.sandbox_spec} session={launch.session} api={api} />}</div>;
}
