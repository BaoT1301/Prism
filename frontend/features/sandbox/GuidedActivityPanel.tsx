import type { GuidedStep } from "./sandbox-types";

export function GuidedActivityPanel({ steps, completedStepIds, onRun }: { steps: GuidedStep[]; completedStepIds: string[]; onRun: () => void }) {
  const activeStep = steps.find((step) => !completedStepIds.includes(step.id));
  return (
    <section className="format-panel guided-activity-panel" aria-labelledby="guided-activity-title">
      <div className="section-heading"><div><p className="card-kicker">Guided investigation</p><h2 id="guided-activity-title">Follow the mission path.</h2></div><strong>{completedStepIds.length} / {steps.length}</strong></div>
      <div className="active-investigation"><span>{activeStep ? "Next move" : "Investigation complete"}</span><p>{activeStep?.instruction ?? "Your evidence and reflection are ready to submit."}</p>{activeStep && <button className="secondary-button" type="button" onClick={onRun}>Test this step</button>}</div>
    </section>
  );
}
