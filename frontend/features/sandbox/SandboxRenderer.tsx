import { ParameterExplorer } from "./ParameterExplorer";
import { validateSandboxSpec } from "./sandbox-validation";
import type { SandboxApi } from "../../lib/sandbox/sandbox-api";
import type { SandboxSession, SandboxSpec } from "./sandbox-types";

export function SandboxRenderer({ spec, session, api, onSubmitted }: { spec: SandboxSpec; session: SandboxSession; api: SandboxApi; onSubmitted?: () => void }) {
  try {
    const validated = validateSandboxSpec(spec);
    if (validated.sandbox_type === "parameter_explorer") return <ParameterExplorer spec={validated} initialSession={session} api={api} onSubmitted={onSubmitted} />;
  } catch (error) {
    return <p role="alert">{error instanceof Error ? error.message : "The sandbox configuration is invalid."}</p>;
  }
  return <p role="alert">This sandbox type is not supported.</p>;
}
