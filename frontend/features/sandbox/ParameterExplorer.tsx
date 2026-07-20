import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";

import { PrismBrand } from "../../components/AppChrome";
import { CompletionScreen } from "../../components/sandbox/CompletionScreen";
import { HintPanel } from "../../components/sandbox/HintPanel";
import { PhysicsScene } from "../../components/sandbox/PhysicsScene";
import { ReflectionForm } from "../../components/sandbox/ReflectionForm";
import { SaveStatus } from "../../components/sandbox/SaveStatus";
import { VariableSlider } from "../../components/sandbox/VariableSlider";
import { SandboxApiError, type SandboxApi } from "../../lib/sandbox/sandbox-api";
import { completionRulesSatisfied, mergeCompletedStepIds } from "./completion";
import { calculateFormula } from "./formula-registry";
import { GraphLabPanel } from "./GraphLabPanel";
import { GuidedActivityPanel } from "./GuidedActivityPanel";
import { evaluateMission } from "./mission";
import { buildProgressRequest, progressPercentage } from "./progress";
import type { HintResponse, ReflectionAnswer, SandboxSession, SandboxSpec, SandboxType } from "./sandbox-types";

const ThreePhysicsScene = lazy(async () => {
  const module = await import("../../components/sandbox/ThreePhysicsScene");
  return { default: module.ThreePhysicsScene };
});

export function ParameterExplorer({
  spec,
  initialSession,
  api,
  onExit,
  format = "parameter_explorer",
}: {
  spec: SandboxSpec;
  initialSession: SandboxSession;
  api: SandboxApi;
  onExit?: () => void;
  format?: SandboxType;
}) {
  const formatCopy: Record<SandboxType, { eyebrow: string; heading: string; controls: string }> = {
    parameter_explorer: { eyebrow: "Experiment 01 · Parameter explorer", heading: "Shape the experiment.", controls: "Physics controls" },
    graph_lab: { eyebrow: "Experiment 02 · Graph lab", heading: "Build a force story.", controls: "Trial controls" },
    guided_activity: { eyebrow: "Experiment 03 · Guided investigation", heading: "Test the next idea.", controls: "Investigation controls" },
  };
  const formatDetails = formatCopy[format];
  const initialValues = Object.fromEntries(spec.variables.map((variable) => [variable.id, initialSession.responses[variable.id] ?? variable.default]));
  const [values, setValues] = useState<Record<string, number>>(initialValues);
  const [completedStepIds, setCompletedStepIds] = useState(initialSession.completed_step_ids);
  const [session, setSession] = useState(initialSession);
  const [saveStatus, setSaveStatus] = useState<Parameters<typeof SaveStatus>[0]["status"]>("idle");
  const [hint, setHint] = useState<HintResponse>();
  const [hintError, setHintError] = useState<string>();
  const [isRequestingHint, setIsRequestingHint] = useState(false);
  const [reflectionAnswers, setReflectionAnswers] = useState<ReflectionAnswer[]>(initialSession.reflection_answers);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [submittedAt, setSubmittedAt] = useState<string | undefined>(
    initialSession.status === "submitted" ? initialSession.submitted_at : undefined,
  );
  const [runToken, setRunToken] = useState(0);
  const [lastRunAt, setLastRunAt] = useState(() => Date.now());
  const [firstSolution, setFirstSolution] = useState<Record<string, number> | undefined>();
  const [bonusAttempted, setBonusAttempted] = useState(false);
  const [hasThreeDimension, setHasThreeDimension] = useState(false);
  const firstRender = useRef(true);
  const sessionRef = useRef(initialSession);
  const saveGenerationRef = useRef(0);
  sessionRef.current = session;
  const result = useMemo(() => calculateFormula(spec.formula_id, values), [spec.formula_id, values]);
  const missionEvaluation = spec.mission ? evaluateMission(spec, values) : undefined;
  const percentage = progressPercentage(spec.guided_steps, completedStepIds);
  const guidedCompletionReady = completionRulesSatisfied(spec, completedStepIds, reflectionAnswers);
  const recordedMissionComplete = Boolean(session.interaction_events?.some((event) => event.event_type === "experiment_run" && event.mission_complete));
  const missionComplete = spec.mission ? recordedMissionComplete : guidedCompletionReady;
  const submissionReady = guidedCompletionReady && missionComplete;

  useEffect(() => {
    setCompletedStepIds((current) => {
      const next = mergeCompletedStepIds(spec, current, values, reflectionAnswers);
      return next.length === current.length ? current : next;
    });
  }, [reflectionAnswers, spec, values]);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const generation = ++saveGenerationRef.current;
    const timer = window.setTimeout(async () => {
      setSaveStatus("saving");
      const requestSession = sessionRef.current;
      try {
        const latest = await api.updateProgress(requestSession.id, buildProgressRequest(requestSession, completedStepIds, values, reflectionAnswers));
        sessionRef.current = { ...sessionRef.current, ...latest };
        setSession((current) => ({ ...current, ...latest }));
        if (generation === saveGenerationRef.current) setSaveStatus("saved");
      } catch (error) {
        if (error instanceof SandboxApiError && error.status === 409) {
          const latest = await api.getSession(requestSession.id);
          sessionRef.current = latest;
          setSession((current) => ({ ...current, ...latest }));
          if (generation === saveGenerationRef.current) setSaveStatus("conflict");
        } else if (generation === saveGenerationRef.current) setSaveStatus("error");
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [api, completedStepIds, reflectionAnswers, values]);

  async function requestHint() {
    if (isRequestingHint) return;
    setIsRequestingHint(true);
    setHintError(undefined);
    try {
      const nextHint = await api.requestHint(session.id, "", spec.guided_steps.find((step) => !completedStepIds.includes(step.id))?.id);
      setHint(nextHint);
      setSession((current) => ({ ...current, hints_used: nextHint.hint_level }));
    } catch (error) {
      setHintError(error instanceof Error ? error.message : "Unable to request a hint.");
    } finally {
      setIsRequestingHint(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      const submission = await api.submit(session.id, session.version, reflectionAnswers);
      setSession((current) => ({ ...current, status: "submitted", submitted_at: submission.submitted_at, feedback: submission.feedback }));
      setSubmittedAt(submission.submitted_at);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to complete this mission.");
    } finally {
      setSubmitting(false);
    }
  }

  async function runExperiment() {
    if (!spec.mission || !missionEvaluation) return;
    const now = Date.now();
    const evaluation = missionEvaluation;
    if (evaluation.complete && !firstSolution) setFirstSolution(values);
    const event = {
      event_type: "experiment_run" as const,
      recorded_at: new Date(now).toISOString(),
      elapsed_ms: now - lastRunAt,
      values,
      controlled_comparison: true,
    };
    try {
      const latest = await api.updateProgress(session.id, buildProgressRequest(session, completedStepIds, values, reflectionAnswers, event));
      setSession((current) => ({ ...current, ...latest, mission_evaluation: evaluation }));
      sessionRef.current = { ...sessionRef.current, ...latest };
      setLastRunAt(now);
      if (firstSolution && evaluation.complete && (Math.abs((firstSolution.mass ?? 0) - (values.mass ?? 0)) >= (spec.mission.bonus_condition.minimum_difference?.mass ?? 0) || Math.abs((firstSolution.acceleration ?? 0) - (values.acceleration ?? 0)) >= (spec.mission.bonus_condition.minimum_difference?.acceleration ?? 0))) setBonusAttempted(true);
      setRunToken((token) => token + 1);
    } catch (error) {
      setSaveStatus(error instanceof SandboxApiError && error.status === 409 ? "conflict" : "error");
    }
  }

  if (submittedAt) {
    return <CompletionScreen title={spec.title} completedSteps={completedStepIds.length} totalSteps={spec.guided_steps.length} hintsUsed={session.hints_used} submittedAt={submittedAt} feedback={session.feedback} onExit={onExit} />;
  }

  return (
    <div className={`sandbox-app theme-${spec.visual_theme ?? "basketball"}`}>
      <header className="lab-topbar">
        <PrismBrand />
        <div><span className="lab-chip"><i aria-hidden="true" /> Interactive lab</span>{onExit && <button className="text-button" type="button" onClick={onExit}>Exit assignment</button>}</div>
      </header>
      <main className="sandbox-main">
        <section className="mission-hero">
          <div><p className="eyebrow">{formatDetails.eyebrow}</p><h1>{spec.title}</h1><p className="mission-intro">{spec.introduction}</p></div>
          <div className="mission-status"><span className="status-dot" />{missionComplete ? (spec.mission ? "Mission complete" : "Experiment complete") : (spec.mission && missionEvaluation?.complete ? "Ready to record" : spec.mission ? "Mission in progress" : `${percentage}% explored`)}</div>
        </section>

        <div className="sandbox-dashboard">
          <div className="simulation-column">
            <Suspense fallback={null}><ThreePhysicsScene spec={spec} values={values} runToken={runToken} active={hasThreeDimension} onAvailability={setHasThreeDimension} /></Suspense>
            {!hasThreeDimension && <PhysicsScene spec={spec} values={values} runToken={runToken} />}
            {spec.mission && <button className="primary-button mission-run-button" type="button" onClick={() => void runExperiment()}>Run and record experiment</button>}
            <div className="simulation-action"><div><p className="card-kicker">Ready when you are</p><strong>Change a variable, then run the experiment.</strong></div><button className="primary-button" type="button" onClick={() => setRunToken((token) => token + 1)}>Run experiment <span aria-hidden="true">→</span></button></div>
          </div>
          <aside className="coach-column">
            <HintPanel hint={hint} remaining={hint?.remaining_hint_levels ?? Math.max(0, 3 - session.hints_used)} isRequesting={isRequestingHint} onRequest={requestHint} />
            {hintError && <p className="inline-error" role="alert">{hintError}</p>}
            <div className="objective-card"><p className="card-kicker">Learning objective</p><p>{spec.introduction}</p><span className="objective-tag">F = ma</span></div>
          </aside>
        </div>

        <section className="controls-card">
          <div className="section-heading"><div><p className="card-kicker">{formatDetails.controls}</p><h2>{formatDetails.heading}</h2></div><div className="formula-display"><span>Force = Mass × Acceleration</span><strong>{result.toFixed(2)} N</strong></div></div>
          <div className="variable-grid">{spec.variables.map((variable) => <VariableSlider key={variable.id} variable={variable} value={values[variable.id]} onChange={(value) => setValues((current) => ({ ...current, [variable.id]: value }))} />)}</div>
          <div className="physics-hud"><div><span>Mass</span><strong>{values.mass} <small>kg</small></strong></div><div><span>Acceleration</span><strong>{values.acceleration} <small>m/s²</small></strong></div><div className="hud-force"><span>Force</span><strong>{result.toFixed(2)} <small>N</small></strong></div></div>
        </section>

        {format === "graph_lab" && <GraphLabPanel values={values} force={result} />}
        {format === "guided_activity" && <GuidedActivityPanel steps={spec.guided_steps} completedStepIds={completedStepIds} onRun={() => {
          if (spec.mission) void runExperiment();
          else setRunToken((token) => token + 1);
        }} />}

        <section className="guided-progress" aria-labelledby="guided-progress-title">
          <div className="section-heading"><div><p className="card-kicker">Discovery progress</p><h2 id="guided-progress-title">Build your evidence.</h2></div><strong>{completedStepIds.length} / {spec.guided_steps.length}</strong></div>
          <div className="progress-track" role="progressbar" aria-label="Guided steps complete" aria-valuemin={0} aria-valuemax={spec.guided_steps.length} aria-valuenow={completedStepIds.length}><span style={{ width: `${percentage}%` }} /></div>
          <ol className="guided-step-list">{spec.guided_steps.map((step, index) => {
            const complete = completedStepIds.includes(step.id);
            return <li className={complete ? "is-complete" : ""} key={step.id}><span aria-hidden="true">{complete ? "✓" : String(index + 1).padStart(2, "0")}</span><p>{step.instruction}</p></li>;
          })}</ol>
        </section>

        {spec.mission && missionEvaluation && <section className="mission-card">
          <div className="section-heading"><div><p className="card-kicker">Mission progress</p><h2>{spec.mission.title}</h2></div><strong className="progress-label">{missionComplete ? "Complete" : missionEvaluation.complete ? "Ready" : "In progress"}</strong></div>
          <p className="mission-context">{spec.mission.context}</p>
          <div className="mission-constraints">{missionEvaluation.constraints.map((constraint) => <div className={constraint.satisfied ? "constraint is-satisfied" : "constraint"} key={constraint.id}><span aria-hidden="true">{constraint.satisfied ? "✓" : "○"}</span><div><strong>{constraint.label}</strong><small>{constraint.current_value === null ? "Run an experiment to see the current value." : `${constraint.current_value} · ${constraint.message}`}</small></div></div>)}</div>
          {missionComplete && spec.mission.bonus_condition.enabled && <div className="bonus-panel"><strong>Optional extension</strong><p>{spec.mission.bonus_condition.description}</p>{bonusAttempted && <small>Second valid solution recorded.</small>}</div>}
        </section>}

        <ReflectionForm questions={spec.reflection_questions} answers={reflectionAnswers} onChange={setReflectionAnswers} />
        {submitError && <p className="notice" role="alert">{submitError}</p>}
        <div className="completion-bar">
          <SaveStatus status={saveStatus} />
          <div><p>{submissionReady ? "Every required step is complete and recorded." : spec.mission && missionEvaluation?.complete ? "Record this successful experiment, then finish the checklist and reflection." : "Finish the checklist, reflection, and recorded experiment to complete the mission."}</p><button className="complete-button" type="button" disabled={submitting || session.status === "submitted" || !submissionReady} onClick={() => void submit()}>{session.status === "submitted" ? "Mission complete" : submitting ? "Saving mission..." : "Complete mission →"}</button></div>
        </div>
      </main>
    </div>
  );
}
