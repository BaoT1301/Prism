import type { GuidedStep } from "../../features/sandbox/sandbox-types";

export function GuidedSteps({ steps, completedStepIds, automaticStepIds, onToggle }: { steps: GuidedStep[]; completedStepIds: string[]; automaticStepIds: string[]; onToggle: (stepId: string) => void }) {
  const completed = new Set(completedStepIds);
  const automatic = new Set(automaticStepIds);
  const doneCount = steps.filter((step) => completed.has(step.id)).length;
  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">{doneCount} of {steps.length} steps complete.</p>
      <ol className="mission-checklist">
        {steps.map((step, index) => {
          const isDone = completed.has(step.id);
          const isAuto = automatic.has(step.id);
          return (
            <li className={isDone ? "is-complete" : ""} key={step.id}>
              <label>
                <input type="checkbox" checked={isDone} disabled={isAuto} data-testid={`guided-step-${step.id}`} onChange={() => onToggle(step.id)} />
                <span className="step-number" aria-hidden="true">{isDone ? "✓" : index + 1}</span>
                <span className="step-instruction">{step.instruction}</span>
                <span className={`step-state ${isDone ? "state-done" : isAuto ? "state-auto" : "state-manual"}`}>
                  {isDone ? "Done" : isAuto ? "Auto-checks" : "Tap when done"}
                </span>
              </label>
            </li>
          );
        })}
      </ol>
    </>
  );
}
