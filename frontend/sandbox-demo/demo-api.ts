import { ApiError } from "../lib/api-client";
import { type SandboxApi } from "../lib/sandbox/sandbox-api";
import type {
  HintResponse,
  ProgressRequest,
  ProgressResponse,
  ReflectionAnswer,
  SandboxSession,
  SandboxSpec,
  StartAssignmentResponse,
  SubmissionResponse,
} from "../features/sandbox/sandbox-types";

export interface DemoSandboxApi extends SandboxApi {
  reset(): void;
}

export const DEMO_STORAGE_VERSION = "v2";

/** Builds the localStorage key for a spec at the current storage version. */
export function demoStorageKey(spec: SandboxSpec, version: string = DEMO_STORAGE_VERSION): string {
  return `prism-sandbox-demo:${version}:${spec.title}`;
}

interface StoredDemoState {
  session: SandboxSession;
  submission?: SubmissionResponse;
}

function createSession(spec: SandboxSpec): SandboxSession {
  return {
    id: crypto.randomUUID(),
    version: 1,
    status: "in_progress",
    completed_step_ids: [],
    responses: Object.fromEntries(spec.variables.map((variable) => [variable.id, variable.default])),
    reflection_answers: [],
    hints_used: 0,
    updated_at: new Date().toISOString(),
  };
}

export function createDemoSandboxApi(spec: SandboxSpec, storage: Storage = window.localStorage): DemoSandboxApi {
  const storageKey = demoStorageKey(spec);
  const readState = (): StoredDemoState | null => {
    const raw = storage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as StoredDemoState) : null;
  };
  const writeState = (state: StoredDemoState) => storage.setItem(storageKey, JSON.stringify(state));
  const requireState = (): StoredDemoState => {
    const state = readState();
    if (!state) throw new ApiError("The demo session has not started.", { status: 404, code: "SESSION_NOT_FOUND" });
    return state;
  };

  return {
    async startAssignment(_assignmentId: string): Promise<StartAssignmentResponse> {
      const existing = readState();
      const state = existing ?? { session: createSession(spec) };
      writeState(state);
      return {
        generated_assignment: {
          id: `generated-${spec.title}`,
          assignment_id: "demo-assignment",
          student_id: "demo-student",
          personalized_title: spec.title,
          scenario: spec.introduction,
          problem_statement: "Explore the variables and complete the guided steps.",
          learning_objective: "Apply the supported formula through an interactive exploration.",
          instructions: spec.guided_steps.map((step) => step.instruction),
          reflection_questions: spec.reflection_questions,
          sandbox_spec: spec,
          generated_at: new Date().toISOString(),
        },
        cache_status: existing ? "hit" : "miss",
        session: state.session,
      };
    },

    async launchAssignment(assignmentId: string) {
      const started = await this.startAssignment(assignmentId);
      return { assignment: started.generated_assignment, session: started.session, cache_status: started.cache_status };
    },

    async getSession(_sessionId: string): Promise<SandboxSession> {
      return requireState().session;
    },

    async updateProgress(_sessionId: string, request: ProgressRequest): Promise<ProgressResponse> {
      const state = requireState();
      if (state.session.version !== request.expected_version) {
        throw new ApiError("The demo session has a newer version.", { status: 409, code: "SESSION_VERSION_CONFLICT" });
      }
      state.session = {
        ...state.session,
        version: state.session.version + 1,
        completed_step_ids: request.completed_step_ids,
        responses: request.responses,
        reflection_answers: request.reflection_answers,
        updated_at: new Date().toISOString(),
      };
      writeState(state);
      return state.session;
    },

    async requestHint(_sessionId: string, _question?: string, currentStepId?: string): Promise<HintResponse> {
      const state = requireState();
      if (state.session.hints_used >= 3) {
        throw new ApiError("No more hints are available for this session.", { status: 429, code: "HINT_LIMIT_REACHED" });
      }
      state.session = { ...state.session, hints_used: state.session.hints_used + 1, updated_at: new Date().toISOString() };
      writeState(state);
      const step = currentStepId ? `step ${currentStepId}` : "the next guided step";
      const currentStep = spec.guided_steps.find((item) => item.id === currentStepId);
      const variableId = currentStep?.completion_checks?.find((check) => check.variable_id)?.variable_id;
      const variable = spec.variables.find((item) => item.id === variableId)?.label ?? "the changing variable";
      const hints = [
        `Focus on ${variable.toLowerCase()} while working on ${step}. What happens when you change it?`,
        `Keep the other variable steady and compare the calculated force before and after changing ${variable.toLowerCase()}.`,
        "Use force = mass × acceleration to explain why the force changed.",
      ];
      return {
        hint_level: state.session.hints_used,
        hint: hints[state.session.hints_used - 1],
        remaining_hint_levels: 3 - state.session.hints_used,
      };
    },

    async submit(_sessionId: string, expectedSessionVersion: number, reflectionAnswers: ReflectionAnswer[]): Promise<SubmissionResponse> {
      const state = requireState();
      if (state.submission) return state.submission;
      if (state.session.version !== expectedSessionVersion) {
        throw new ApiError("The demo session has a newer version.", { status: 409, code: "SESSION_VERSION_CONFLICT" });
      }
      const submission: SubmissionResponse = {
        id: crypto.randomUUID(),
        assignment_id: "demo-assignment",
        student_id: "demo-student",
        status: "submitted",
        submitted_at: new Date().toISOString(),
      };
      state.session = { ...state.session, status: "submitted", reflection_answers: reflectionAnswers, submitted_at: submission.submitted_at } as SandboxSession;
      state.submission = submission;
      writeState(state);
      return submission;
    },

    reset() {
      storage.removeItem(storageKey);
    },
  };
}
