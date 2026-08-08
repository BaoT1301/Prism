import { toFiniteNumber } from "../../lib/guards";
import type { ReflectionAnswer, SandboxSession } from "./sandbox-types";

export const CONFLICT_STATUS = 409;

/** A version conflict is the only error the save/submit flow reconciles rather than surfaces. */
export function isConflictError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { status?: number }).status === CONFLICT_STATUS;
}

export interface LocalEdits {
  completedStepIds: string[];
  responses: Record<string, number>;
  reflectionAnswers: ReflectionAnswer[];
}

function isReflectionAnswer(value: unknown): value is ReflectionAnswer {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ReflectionAnswer).question_id === "string" &&
    typeof (value as ReflectionAnswer).answer === "string"
  );
}

function sanitizeResponses(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const num = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(num)) out[key] = num;
  }
  return out;
}

/**
 * Coerces an untrusted session payload into a render-safe shape. Guarantees
 * arrays are arrays, responses are finite numbers, and version/hints are
 * numbers, so a malformed backend response can never throw during render.
 */
export function sanitizeSession(raw: unknown): SandboxSession {
  const source = (raw ?? {}) as Partial<SandboxSession>;
  const status = source.status === "submitted" || source.status === "completed" ? source.status : "in_progress";
  return {
    id: typeof source.id === "string" ? source.id : "",
    version: toFiniteNumber(source.version, 0),
    status,
    completed_step_ids: Array.isArray(source.completed_step_ids)
      ? source.completed_step_ids.filter((id): id is string => typeof id === "string")
      : [],
    responses: sanitizeResponses(source.responses),
    reflection_answers: Array.isArray(source.reflection_answers)
      ? source.reflection_answers.filter(isReflectionAnswer)
      : [],
    hints_used: toFiniteNumber(source.hints_used, 0),
    updated_at: typeof source.updated_at === "string" ? source.updated_at : undefined,
    submitted_at: typeof source.submitted_at === "string" ? source.submitted_at : undefined,
  };
}

function mergeReflection(serverAnswers: ReflectionAnswer[], localAnswers: ReflectionAnswer[]): ReflectionAnswer[] {
  const merged = new Map(serverAnswers.map((answer) => [answer.question_id, answer]));
  for (const answer of localAnswers) merged.set(answer.question_id, answer); // local edits win
  return [...merged.values()];
}

/**
 * After a version conflict, rebase the student's local edits onto the server's
 * authoritative session: adopt the server version, but preserve local work by
 * unioning completed steps and letting local responses/answers win. This means
 * concurrent server-side progress is merged in rather than silently clobbered.
 */
export function rebaseOntoServer(server: SandboxSession, local: LocalEdits): SandboxSession {
  return {
    ...server,
    completed_step_ids: [...new Set([...server.completed_step_ids, ...local.completedStepIds])],
    responses: { ...server.responses, ...local.responses },
    reflection_answers: mergeReflection(server.reflection_answers, local.reflectionAnswers),
  };
}

export interface SerialRunner {
  /** Trigger the task. If one is already running, coalesce into a single follow-up run. */
  run(): Promise<void>;
  /** Force a follow-up run of the task even if one is currently in flight. */
  schedulePending(): void;
  /** Resolve once no run is in flight (including any coalesced follow-up). */
  settled(): Promise<void>;
}

/**
 * Serializes an async task so it never overlaps itself. Calls made while a run
 * is in flight are collapsed into exactly one follow-up run using the latest
 * state — this is what prevents two autosaves from sending the same stale
 * `expected_version` and manufacturing a false conflict.
 */
export function createSerialRunner(task: () => Promise<void>): SerialRunner {
  let running: Promise<void> | null = null;
  let pending = false;

  const start = (): Promise<void> => {
    running = (async () => {
      try {
        do {
          pending = false;
          await task();
        } while (pending);
      } finally {
        running = null;
      }
    })();
    return running;
  };

  return {
    run() {
      if (running) {
        pending = true;
        return running;
      }
      return start();
    },
    schedulePending() {
      if (running) pending = true;
    },
    settled() {
      return running ?? Promise.resolve();
    },
  };
}
