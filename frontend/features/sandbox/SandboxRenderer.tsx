import { ErrorBoundary } from "../../components/ErrorBoundary";
import { ParameterExplorer } from "./ParameterExplorer";
import { validateSandboxSpec } from "./sandbox-validation";
import type { SandboxApi } from "../../lib/sandbox/sandbox-api";
import type { SandboxSession, SandboxSpec } from "./sandbox-types";

export function SandboxRenderer({ spec, session, api, onExit }: { spec: SandboxSpec; session: SandboxSession; api: SandboxApi; onExit?: () => void }) {
  let validated: SandboxSpec;
  try {
    validated = validateSandboxSpec(spec);
  } catch (error) {
    return <p role="alert">{error instanceof Error ? error.message : "The sandbox configuration is invalid."}</p>;
  }
  if (validated.sandbox_type !== "parameter_explorer") return <p role="alert">This sandbox type is not supported.</p>;
  return (
    <ErrorBoundary
      fallback={({ reset }) => (
        <main className="system-message" role="alert" data-testid="sandbox-error">
          <p className="eyebrow">This experiment stalled</p>
          <h1>We could not render this lab.</h1>
          <p>Your progress is saved. Try reloading the experiment.</p>
          <div className="button-group">
            <button type="button" onClick={reset}>Try again</button>
            {onExit && <button className="secondary-button" type="button" onClick={onExit}>Exit assignment</button>}
          </div>
        </main>
      )}
    >
      <ParameterExplorer spec={validated} initialSession={session} api={api} onExit={onExit} />
    </ErrorBoundary>
  );
}
