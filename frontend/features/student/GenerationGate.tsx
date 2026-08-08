import { useEffect, useState } from "react";

import { PrismBrand } from "../../components/AppChrome";
import { AsyncState, Notice, Skeleton } from "../../components/AsyncState";
import { ApiError, isAbortError } from "../../lib/api-client";
import type { SandboxLaunch } from "../sandbox/sandbox-types";
import type { GenerationStatus } from "./student-api";

const POLL_INTERVAL_MS = 1500;
const MAX_POLLS = 40; // ~60s ceiling before we surface a retry rather than spin forever

// A launch that comes back mid-generation is treated as "pending" — either the
// start call resolves without a usable spec, or it rejects with one of these
// in-flight signals (202 Accepted / 425 Too Early / a generation-ish error code).
const PENDING_CODE = /GENERAT|PENDING|PROCESS|PERSONALIZ|ACCEPTED/i;

function isPendingSignal(error: ApiError): boolean {
  if (error.status === 202 || error.status === 425) return true;
  return typeof error.code === "string" && PENDING_CODE.test(error.code);
}

function isLaunchReady(value: SandboxLaunch | undefined): boolean {
  const variables = value?.assignment?.sandbox_spec?.variables;
  return Array.isArray(variables) && variables.length > 0;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const onAbort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Full-screen personalization gate. Attempts the launch; if generation is still
 * in flight it polls `status` until the assignment is `completed`/available (then
 * re-launches and hands the ready sandbox to `onReady`) or `failed`/timed-out
 * (then shows a clear, retryable error). All work is cancelled on unmount.
 */
export function GenerationGate({
  assignmentId,
  assignmentTitle,
  launch,
  status,
  onReady,
  onCancel,
  onAuthExpired,
}: {
  assignmentId: string;
  assignmentTitle: string;
  launch: (assignmentId: string) => Promise<SandboxLaunch>;
  status: (assignmentId: string, signal?: AbortSignal) => Promise<GenerationStatus>;
  onReady: (launch: SandboxLaunch) => void;
  onCancel: () => void;
  onAuthExpired: () => void;
}) {
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let done = false;

    const succeed = (launched: SandboxLaunch) => { if (!done && !signal.aborted) { done = true; onReady(launched); } };
    const fail = (reason: string) => { if (!signal.aborted) setError(reason); };

    const tryLaunch = async (): Promise<"ready" | "pending"> => {
      try {
        const launched = await launch(assignmentId);
        if (isLaunchReady(launched)) { succeed(launched); return "ready"; }
        return "pending";
      } catch (reason) {
        if (isAbortError(reason)) throw reason;
        if (reason instanceof ApiError && reason.isAuthError) { onAuthExpired(); throw reason; }
        if (reason instanceof ApiError && isPendingSignal(reason)) return "pending";
        throw reason;
      }
    };

    const run = async () => {
      try {
        if (await tryLaunch() === "ready") return;
        for (let poll = 0; poll < MAX_POLLS; poll++) {
          await sleep(POLL_INTERVAL_MS, signal);
          const current = await status(assignmentId, signal);
          if (current === "failed") { fail("We couldn't personalize this assignment. Please try again."); return; }
          if (current === "completed" || current === "none") {
            if (await tryLaunch() === "ready") return;
          }
        }
        fail("This is taking longer than expected. Please try again in a moment.");
      } catch (reason) {
        if (isAbortError(reason)) return;
        if (reason instanceof ApiError && reason.isAuthError) return; // already routed to onAuthExpired
        fail(reason instanceof Error ? reason.message : "Something went wrong while preparing your assignment.");
      }
    };

    void run();
    return () => controller.abort();
  }, [assignmentId, attempt, launch, status, onReady, onAuthExpired]);

  return (
    <GenerationPending
      title={assignmentTitle}
      error={error}
      onRetry={() => { setError(undefined); setAttempt((value) => value + 1); }}
      onCancel={onCancel}
    />
  );
}

/**
 * Presentational pending/error screen. While waiting it shows a skeleton and
 * reassuring copy; on failure it swaps to an error notice with retry/back.
 */
export function GenerationPending({
  title,
  error,
  onRetry,
  onCancel,
}: {
  title?: string;
  error?: string;
  onRetry?: () => void;
  onCancel: () => void;
}) {
  return (
    <main className="generation-pending" data-testid="generation-pending" role="status" aria-live="polite">
      <div className="generation-pending-card">
        <PrismBrand />
        <p className="eyebrow">{error ? "We hit a snag" : "Personalizing your assignment"}</p>
        <h1>{error ? "Let’s try that again." : "Building your world…"}</h1>
        <p>
          {title && <>Preparing <strong>{title}</strong>. </>}
          {error
            ? "The personalization didn’t finish. You can try again or head back to your assignments."
            : "Prism is shaping this lesson around your interests. This usually only takes a few seconds."}
        </p>
        <AsyncState loading={!error} skeleton={<Skeleton rows={3} className="assignment-skeleton" />}>
          {error ? <Notice error={error} /> : null}
        </AsyncState>
        <div className="generation-pending-actions">
          {error && onRetry && <button type="button" onClick={onRetry}>Try again</button>}
          <button type="button" className="secondary-button" onClick={onCancel}>{error ? "Back to assignments" : "Cancel"}</button>
        </div>
      </div>
    </main>
  );
}
