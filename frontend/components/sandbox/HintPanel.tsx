import type { HintResponse } from "../../features/sandbox/sandbox-types";

export function HintPanel({ hint, remaining, disabled, onRequest }: { hint?: HintResponse; remaining: number; disabled?: boolean; onRequest: () => Promise<void> }) {
  return <section className="coach-card"><div className="coach-heading"><span className="coach-avatar">✦</span><div><p className="card-kicker">Your learning companion</p><h2>AI Coach</h2></div></div><p className="coach-prompt">{hint ? <><strong>Coach tip {hint.hint_level}:</strong> {hint.hint}</> : "Need a nudge? I can help you notice the pattern without giving away the answer."}</p><button className="secondary-button" type="button" disabled={disabled || remaining === 0} onClick={() => void onRequest()}>{remaining === 0 ? "All hints used" : `Ask for a hint · ${remaining} left`}</button></section>;
}
