import { ParameterExplorer } from "./ParameterExplorer";
import { validateSandboxSpec } from "./sandbox-validation";
import type { SandboxApi } from "../../lib/sandbox/sandbox-api";
import type { SandboxSession, SandboxSpec } from "./sandbox-types";

export function SandboxRenderer({ spec, session, api, onExit }: { spec: SandboxSpec; session: SandboxSession; api: SandboxApi; onExit?: () => void }) {
  try {
    const validated = validateSandboxSpec(spec);
    if (validated.sandbox_type === "parameter_explorer") return <ParameterExplorer spec={validated} initialSession={session} api={api} onExit={onExit} />;
  } catch (error) {
    return <p role="alert">{error instanceof Error ? error.message : "The sandbox configuration is invalid."}</p>;
  }
  return <p role="alert">This sandbox type is not supported.</p>;
}
