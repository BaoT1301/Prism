import type { GuidedStep } from "../../features/sandbox/sandbox-types";

export function GuidedSteps({ steps, completedStepIds, automaticStepIds, onToggle }: { steps: GuidedStep[]; completedStepIds: string[]; automaticStepIds: string[]; onToggle: (stepId: string) => void }) {
  const completed = new Set(completedStepIds);
  const automatic = new Set(automaticStepIds);
  return <ol>{steps.map((step) => <li key={step.id}><label><input type="checkbox" checked={completed.has(step.id)} disabled={automatic.has(step.id)} onChange={() => onToggle(step.id)} /> <span>{step.instruction}</span></label></li>)}</ol>;
}
