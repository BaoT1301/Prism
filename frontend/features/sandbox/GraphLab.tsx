import { ParameterExplorer } from "./ParameterExplorer";
import type { SandboxApi } from "../../lib/sandbox/sandbox-api";
import type { SandboxSession, SandboxSpec } from "./sandbox-types";

export function GraphLab({ spec, initialSession, api, onExit }: { spec: SandboxSpec; initialSession: SandboxSession; api: SandboxApi; onExit?: () => void }) {
  return <ParameterExplorer spec={spec} initialSession={initialSession} api={api} onExit={onExit} format="graph_lab" />;
}
