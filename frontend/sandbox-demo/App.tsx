import { useEffect, useMemo, useState } from "react";
import basketball from "../features/sandbox/fixtures/basketball.json";
import formula1 from "../features/sandbox/fixtures/formula1.json";
import space from "../features/sandbox/fixtures/space.json";
import { SandboxRenderer } from "../features/sandbox/SandboxRenderer";
import { validateSandboxSpec } from "../features/sandbox/sandbox-validation";
import type { SandboxSpec } from "../features/sandbox/sandbox-types";
import { createDemoSandboxApi, type DemoSandboxApi } from "./demo-api";
import "./styles.css";

const fixtureMap = {
  basketball: validateSandboxSpec(basketball),
  formula1: validateSandboxSpec(formula1),
  space: validateSandboxSpec(space),
} satisfies Record<string, SandboxSpec>;

type FixtureName = keyof typeof fixtureMap;

export function App() {
  const [fixtureName, setFixtureName] = useState<FixtureName>("basketball");
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

  return <div className="demo-shell"><header className="demo-header"><div><h1 className="product-title">PRISM INTERACTIVE SANDBOX</h1></div><div className="demo-controls"><label>Fixture<select value={fixtureName} onChange={(event) => setFixtureName(event.target.value as FixtureName)}><option value="basketball">Basketball</option><option value="formula1">Formula 1</option><option value="space">Space</option></select></label><button type="button" onClick={resetDemo}>Reset demo</button></div></header><section className="demo-status">{launch && <span>Session version: {launch.session.version}</span>}<span>Progress is saved in this browser.</span></section>{loading && <p className="center-message">Loading sandbox...</p>}{error && <p className="center-message error" role="alert">{error}</p>}{launch && <SandboxRenderer key={`${fixtureName}-${reloadKey}`} spec={launch.assignment.sandbox_spec} session={launch.session} api={api} />}</div>;
}
