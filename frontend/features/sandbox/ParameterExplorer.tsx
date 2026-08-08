import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PrismBrand } from "../../components/AppChrome";
import { CompletionScreen } from "../../components/sandbox/CompletionScreen";
import { GuidedSteps } from "../../components/sandbox/GuidedSteps";
import { HintPanel } from "../../components/sandbox/HintPanel";
import { PhysicsScene } from "../../components/sandbox/PhysicsScene";
import { ReflectionForm } from "../../components/sandbox/ReflectionForm";
import { SaveStatus } from "../../components/sandbox/SaveStatus";
import { VariableSlider } from "../../components/sandbox/VariableSlider";
import { toFiniteNumber } from "../../lib/guards";
import type { SandboxApi } from "../../lib/sandbox/sandbox-api";
import { mergeCompletedStepIds } from "./completion";
import { calculateFormula } from "./formula-registry";
import { buildProgressRequest, progressPercentage } from "./progress";
import { createSerialRunner, isConflictError, type LocalEdits, rebaseOntoServer, sanitizeSession } from "./session-sync";
import type { HintResponse, ReflectionAnswer, SandboxSession, SandboxSpec } from "./sandbox-types";

const AUTOSAVE_DELAY_MS = 400;

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
  const startSession = useMemo(() => sanitizeSession(initialSession), [initialSession]);
  // Coerce persisted responses to finite numbers so a malformed payload can never
  // reach calculateFormula and throw during render.
  const initialValues = useMemo(
    () => Object.fromEntries(spec.variables.map((variable) => [variable.id, toFiniteNumber(startSession.responses[variable.id], variable.default)])),
    [spec, startSession],
  );
  const [values, setValues] = useState<Record<string, number>>(initialValues);
  const [completedStepIds, setCompletedStepIds] = useState(startSession.completed_step_ids);
  const [session, setSession] = useState(startSession);
  const [saveStatus, setSaveStatus] = useState<Parameters<typeof SaveStatus>[0]["status"]>("idle");
  const [hint, setHint] = useState<HintResponse>();
  const [hintError, setHintError] = useState<string>();
  const [reflectionAnswers, setReflectionAnswers] = useState<ReflectionAnswer[]>(startSession.reflection_answers);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [submittedAt, setSubmittedAt] = useState<string | undefined>(
    startSession.status === "submitted" ? startSession.submitted_at : undefined,
  );
  const [runToken, setRunToken] = useState(0);
  const firstRender = useRef(true);
  const debounceRef = useRef<number | undefined>(undefined);
  // Authoritative view of the persisted session (version source of truth).
  const sessionRef = useRef<SandboxSession>(startSession);
  // Always-current local edits so a serialized save reads the latest snapshot.
  const latestRef = useRef<LocalEdits>({ completedStepIds, responses: values, reflectionAnswers });
  latestRef.current = { completedStepIds, responses: values, reflectionAnswers };

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

  // Persist the latest snapshot exactly once, reconciling version conflicts.
  const saveTask = useCallback(async () => {
    const snapshot = latestRef.current;
    setSaveStatus("saving");
    const request = buildProgressRequest(sessionRef.current, snapshot.completedStepIds, snapshot.responses, snapshot.reflectionAnswers);
    try {
      const latest = await api.updateProgress(sessionRef.current.id, request);
      sessionRef.current = { ...sessionRef.current, ...latest };
      setSession((current) => ({ ...current, ...latest }));
      setSaveStatus("saved");
    } catch (error) {
      if (!isConflictError(error)) {
        setSaveStatus("error");
        return;
      }
      // Rebase local edits onto the server's authoritative session, then queue
      // one more save so the merged result is pushed with the fresh version.
      const server = await api.getSession(sessionRef.current.id);
      const rebased = rebaseOntoServer(server, latestRef.current);
      sessionRef.current = rebased;
      setSession(rebased);
      setCompletedStepIds(rebased.completed_step_ids);
      setSaveStatus("conflict");
      saveRunnerRef.current.schedulePending();
    }
  }, [api]);

  const saveTaskRef = useRef(saveTask);
  saveTaskRef.current = saveTask;
  const saveRunnerRef = useRef(createSerialRunner(() => saveTaskRef.current()));

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => void saveRunnerRef.current.run(), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(debounceRef.current);
  }, [completedStepIds, reflectionAnswers, values]);

  const flushSave = useCallback(async () => {
    window.clearTimeout(debounceRef.current);
    await saveRunnerRef.current.run();
    await saveRunnerRef.current.settled();
  }, []);

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
      // Make sure the latest progress (and version) is persisted before submitting.
      await flushSave();
      for (let attempt = 0; ; attempt++) {
        try {
          const submission = await api.submit(sessionRef.current.id, sessionRef.current.version, latestRef.current.reflectionAnswers);
          sessionRef.current = { ...sessionRef.current, status: "submitted", submitted_at: submission.submitted_at };
          setSession((current) => ({ ...current, status: "submitted", submitted_at: submission.submitted_at }));
          setSubmittedAt(submission.submitted_at);
          return;
        } catch (error) {
          // A concurrent save can bump the version between flush and submit; re-sync once and retry.
          if (isConflictError(error) && attempt === 0) {
            const server = await api.getSession(sessionRef.current.id);
            sessionRef.current = { ...sessionRef.current, version: server.version };
            continue;
          }
          throw error;
        }
      }
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
    <div className={`sandbox-app theme-${spec.visual_theme ?? "basketball"}`} data-testid="sandbox-app">
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
            <div className="simulation-action"><div><p className="card-kicker">Ready when you are</p><strong>Change a variable, then run the experiment.</strong></div><button className="primary-button" type="button" data-testid="run-experiment" onClick={() => setRunToken((token) => token + 1)}>Run experiment <span aria-hidden="true">→</span></button></div>
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
          <div><p>{missionComplete ? "Every experiment step is complete." : "Finish the checklist and reflection to complete the mission."}</p><button className="complete-button" type="button" data-testid="complete-mission" disabled={submitting || session.status === "submitted" || !missionComplete} onClick={() => void submit()}>{session.status === "submitted" ? "Mission complete" : submitting ? "Saving mission..." : "Complete mission →"}</button></div>
        </div>
      </main>
    </div>
  );
}
