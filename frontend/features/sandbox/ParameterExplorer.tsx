import { useEffect, useMemo, useRef, useState } from "react";

import { PrismBrand } from "../../components/AppChrome";
import { CompletionScreen } from "../../components/sandbox/CompletionScreen";
import { GuidedSteps } from "../../components/sandbox/GuidedSteps";
import { HintPanel } from "../../components/sandbox/HintPanel";
import { PhysicsScene } from "../../components/sandbox/PhysicsScene";
import { ReflectionForm } from "../../components/sandbox/ReflectionForm";
import { SaveStatus } from "../../components/sandbox/SaveStatus";
import { VariableSlider } from "../../components/sandbox/VariableSlider";
import { SandboxApiError, type SandboxApi } from "../../lib/sandbox/sandbox-api";
import { mergeCompletedStepIds } from "./completion";
import { calculateFormula } from "./formula-registry";
import { buildProgressRequest, progressPercentage } from "./progress";
import type { HintResponse, ReflectionAnswer, SandboxSession, SandboxSpec } from "./sandbox-types";

export function ParameterExplorer({
  spec,
  initialSession,
  api,
  onExit,
}: {
  spec: SandboxSpec;
  initialSession: SandboxSession;
  api: SandboxApi;
  onExit?: () => void;
}) {
  const initialValues = Object.fromEntries(spec.variables.map((variable) => [variable.id, initialSession.responses[variable.id] ?? variable.default]));
  const [values, setValues] = useState<Record<string, number>>(initialValues);
  const [completedStepIds, setCompletedStepIds] = useState(initialSession.completed_step_ids);
  const [session, setSession] = useState(initialSession);
  const [saveStatus, setSaveStatus] = useState<Parameters<typeof SaveStatus>[0]["status"]>("idle");
  const [hint, setHint] = useState<HintResponse>();
  const [hintError, setHintError] = useState<string>();
  const [reflectionAnswers, setReflectionAnswers] = useState<ReflectionAnswer[]>(initialSession.reflection_answers);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [submittedAt, setSubmittedAt] = useState<string | undefined>(
    initialSession.status === "submitted" ? initialSession.submitted_at : undefined,
  );
  const [runToken, setRunToken] = useState(0);
  const firstRender = useRef(true);
  const sessionRef = useRef(initialSession);
  const saveGenerationRef = useRef(0);
  sessionRef.current = session;
  const result = useMemo(() => calculateFormula(spec.formula_id, values), [spec.formula_id, values]);
  const automaticIds = useMemo(() => spec.guided_steps.filter((step) => (step.completion_checks?.length ?? 0) > 0).map((step) => step.id), [spec]);
  const percentage = progressPercentage(spec.guided_steps, completedStepIds);
  const missionComplete = percentage === 100;

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
    setHintError(undefined);
    try {
      const nextHint = await api.requestHint(session.id, "", spec.guided_steps.find((step) => !completedStepIds.includes(step.id))?.id);
      setHint(nextHint);
      setSession((current) => ({ ...current, hints_used: nextHint.hint_level }));
    } catch (error) {
      setHintError(error instanceof Error ? error.message : "Unable to request a hint.");
    }
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      const submission = await api.submit(session.id, session.version, reflectionAnswers);
      setSession((current) => ({ ...current, status: "submitted", submitted_at: submission.submitted_at }));
      setSubmittedAt(submission.submitted_at);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to complete this mission.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submittedAt) {
    return <CompletionScreen title={spec.title} completedSteps={completedStepIds.length} totalSteps={spec.guided_steps.length} hintsUsed={session.hints_used} submittedAt={submittedAt} onExit={onExit} />;
  }

  return (
    <div className={`sandbox-app theme-${spec.visual_theme ?? "basketball"}`}>
      <header className="lab-topbar">
        <PrismBrand />
        <div><span className="lab-chip"><i aria-hidden="true" /> Interactive lab</span>{onExit && <button className="text-button" type="button" onClick={onExit}>Exit assignment</button>}</div>
      </header>
      <main className="sandbox-main">
        <section className="mission-hero">
          <div><p className="eyebrow">Experiment 01 · Parameter explorer</p><h1>{spec.title}</h1><p className="mission-intro">{spec.introduction}</p></div>
          <div className="mission-status"><span className="status-dot" />{session.status === "submitted" ? "Mission complete" : `${percentage}% explored`}</div>
        </section>

        <div className="sandbox-dashboard">
          <div className="simulation-column">
            <PhysicsScene spec={spec} values={values} runToken={runToken} />
            <div className="simulation-action"><div><p className="card-kicker">Ready when you are</p><strong>Change a variable, then run the experiment.</strong></div><button className="primary-button" type="button" onClick={() => setRunToken((token) => token + 1)}>Run experiment <span aria-hidden="true">→</span></button></div>
          </div>
          <aside className="coach-column">
            <HintPanel hint={hint} remaining={hint?.remaining_hint_levels ?? Math.max(0, 3 - session.hints_used)} onRequest={requestHint} />
            {hintError && <p className="inline-error" role="alert">{hintError}</p>}
            <div className="objective-card"><p className="card-kicker">Learning objective</p><p>{spec.introduction}</p><span className="objective-tag">F = ma</span></div>
          </aside>
        </div>

        <section className="controls-card">
          <div className="section-heading"><div><p className="card-kicker">Physics controls</p><h2>Shape the experiment.</h2></div><div className="formula-display"><span>Force = Mass × Acceleration</span><strong>{result.toFixed(2)} N</strong></div></div>
          <div className="variable-grid">{spec.variables.map((variable) => <VariableSlider key={variable.id} variable={variable} value={values[variable.id]} onChange={(value) => setValues((current) => ({ ...current, [variable.id]: value }))} />)}</div>
          <div className="physics-hud"><div><span>Mass</span><strong>{values.mass} <small>kg</small></strong></div><div><span>Acceleration</span><strong>{values.acceleration} <small>m/s²</small></strong></div><div className="hud-force"><span>Force</span><strong>{result.toFixed(2)} <small>N</small></strong></div></div>
        </section>

        <section className="mission-card">
          <div className="section-heading"><div><p className="card-kicker">Mission progress</p><h2>Complete the checklist.</h2></div><strong className="progress-label">{percentage}%</strong></div>
          <div className="progress-track"><span style={{ width: `${percentage}%` }} /></div>
          <GuidedSteps steps={spec.guided_steps} completedStepIds={completedStepIds} automaticStepIds={automaticIds} onToggle={(id) => setCompletedStepIds((current) => current.includes(id) ? current.filter((stepId) => stepId !== id) : [...current, id])} />
        </section>

        <ReflectionForm questions={spec.reflection_questions} answers={reflectionAnswers} onChange={setReflectionAnswers} />
        {submitError && <p className="notice" role="alert">{submitError}</p>}
        <div className="completion-bar">
          <SaveStatus status={saveStatus} />
          <div><p>{missionComplete ? "Every experiment step is complete." : "Finish the checklist and reflection to complete the mission."}</p><button className="complete-button" type="button" disabled={submitting || session.status === "submitted" || !missionComplete} onClick={() => void submit()}>{session.status === "submitted" ? "Mission complete" : submitting ? "Saving mission..." : "Complete mission →"}</button></div>
        </div>
      </main>
    </div>
  );
}
