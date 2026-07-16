import type { HintResponse } from "../../features/sandbox/sandbox-types";

export function HintPanel({ hint, remaining, disabled, onRequest }: { hint?: HintResponse; remaining: number; disabled?: boolean; onRequest: () => Promise<void> }) {
  return <section><h3>Hints</h3>{hint && <p><strong>Hint {hint.hint_level}:</strong> {hint.hint}</p>}<button type="button" disabled={disabled || remaining === 0} onClick={() => void onRequest()}>Request hint ({remaining} remaining)</button></section>;
}
