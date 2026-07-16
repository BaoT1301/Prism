import { useEffect, useMemo, useRef, useState } from "react";
import { GuidedSteps } from "../../components/sandbox/GuidedSteps";
import { HintPanel } from "../../components/sandbox/HintPanel";
import { PhysicsScene } from "../../components/sandbox/PhysicsScene";
import { ReflectionForm } from "../../components/sandbox/ReflectionForm";
import { SaveStatus } from "../../components/sandbox/SaveStatus";
import { VariableSlider } from "../../components/sandbox/VariableSlider";
import { SandboxApiError, type SandboxApi } from "../../lib/sandbox/sandbox-api";
import { calculateFormula } from "./formula-registry";
import { buildProgressRequest, progressPercentage } from "./progress";
import { automaticallyCompletedStepIds, mergeCompletedStepIds } from "./completion";
import type { HintResponse, ReflectionAnswer, SandboxSession, SandboxSpec } from "./sandbox-types";

export function ParameterExplorer({ spec, initialSession, api, onSubmitted }: { spec: SandboxSpec; initialSession: SandboxSession; api: SandboxApi; onSubmitted?: () => void }) {
  const initialValues = Object.fromEntries(spec.variables.map((variable) => [variable.id, initialSession.responses[variable.id] ?? variable.default]));
  const [values, setValues] = useState<Record<string, number>>(initialValues);
  const [completedStepIds, setCompletedStepIds] = useState(initialSession.completed_step_ids);
  const [session, setSession] = useState(initialSession);
  const [saveStatus, setSaveStatus] = useState<Parameters<typeof SaveStatus>[0]["status"]>("idle");
  const [hint, setHint] = useState<HintResponse>();
  const [hintError, setHintError] = useState<string>();
  const [reflectionAnswers, setReflectionAnswers] = useState<ReflectionAnswer[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const firstRender = useRef(true);
  const result = useMemo(() => calculateFormula(spec.formula_id, values), [spec.formula_id, values]);
  const automaticIds = useMemo(() => spec.guided_steps.filter((step) => (step.completion_checks?.length ?? 0) > 0).map((step) => step.id), [spec]);
  const satisfiedAutomaticIds = useMemo(() => automaticallyCompletedStepIds(spec, values, reflectionAnswers), [spec, values, reflectionAnswers]);
  const allCompletedIds = completedStepIds;
  const percentage = progressPercentage(spec.guided_steps, allCompletedIds);

  useEffect(() => {
    if (satisfiedAutomaticIds.length === 0) return;
    setCompletedStepIds((current) => {
      const next = mergeCompletedStepIds(spec, current, values, reflectionAnswers);
      return next.length === current.length ? current : next;
    });
  }, [reflectionAnswers, satisfiedAutomaticIds, spec, values]);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const timer = window.setTimeout(async () => {
      setSaveStatus("saving");
      try {
        const latest = await api.updateProgress(session.id, buildProgressRequest(session, allCompletedIds, values));
        setSession((current) => ({ ...current, ...latest }));
        setSaveStatus("saved");
      } catch (error) {
        if (error instanceof SandboxApiError && error.status === 409) {
          const latest = await api.getSession(session.id);
          setSession(latest);
          setCompletedStepIds(latest.completed_step_ids);
          setValues((current) => ({ ...current, ...latest.responses }));
          setSaveStatus("conflict");
        } else setSaveStatus("error");
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [allCompletedIds, api, session.id, values]);

  async function requestHint(question = "") {
    setHintError(undefined);
    try { setHint(await api.requestHint(session.id, question, spec.guided_steps.find((step) => !allCompletedIds.includes(step.id))?.id)); }
    catch (error) { setHintError(error instanceof Error ? error.message : "Unable to request a hint."); }
  }

  async function submit() {
    setSubmitting(true);
    try { await api.submit(session.id, session.version, reflectionAnswers); setSession((current) => ({ ...current, status: "submitted" })); onSubmitted?.(); }
    finally { setSubmitting(false); }
  }

  return <main><h1>{spec.title}</h1><p>{spec.introduction}</p><PhysicsScene spec={spec} values={values} /><section><h2>Explore</h2>{spec.variables.map((variable) => <VariableSlider key={variable.id} variable={variable} value={values[variable.id]} onChange={(value) => setValues((current) => ({ ...current, [variable.id]: value }))} />)}<p>Calculated force: <strong>{result}</strong></p></section><section><h2>Guided steps</h2><p>{percentage}% complete</p><GuidedSteps steps={spec.guided_steps} completedStepIds={allCompletedIds} automaticStepIds={automaticIds} onToggle={(id) => setCompletedStepIds((current) => current.includes(id) ? current.filter((stepId) => stepId !== id) : [...current, id])} /></section><SaveStatus status={saveStatus} />{hintError && <p role="alert">{hintError}</p>}<HintPanel hint={hint} remaining={hint?.remaining_hint_levels ?? Math.max(0, 3 - session.hints_used)} onRequest={requestHint} /><ReflectionForm questions={spec.reflection_questions} answers={reflectionAnswers} onChange={setReflectionAnswers} /><button type="button" disabled={submitting || session.status === "submitted"} onClick={() => void submit()}>{session.status === "submitted" ? "Submitted" : submitting ? "Submitting…" : "Submit activity"}</button></main>;
}
