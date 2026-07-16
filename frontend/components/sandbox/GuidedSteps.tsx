import type { GuidedStep } from "../../features/sandbox/sandbox-types";

export function GuidedSteps({ steps, completedStepIds, automaticStepIds, onToggle }: { steps: GuidedStep[]; completedStepIds: string[]; automaticStepIds: string[]; onToggle: (stepId: string) => void }) {
  const completed = new Set(completedStepIds);
  const automatic = new Set(automaticStepIds);
  return <ol className="mission-checklist">{steps.map((step, index) => <li className={completed.has(step.id) ? "is-complete" : ""} key={step.id}><label><input type="checkbox" checked={completed.has(step.id)} disabled={automatic.has(step.id)} onChange={() => onToggle(step.id)} /><span className="step-number">{index + 1}</span><span>{step.instruction}</span></label></li>)}</ol>;
}
