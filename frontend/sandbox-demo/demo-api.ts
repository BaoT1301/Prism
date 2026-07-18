import { SandboxApiError, type SandboxApi } from "../lib/sandbox/sandbox-api";
import { automaticallyCompletedStepIds, completionRulesSatisfied } from "../features/sandbox/completion";
import { evaluateMission } from "../features/sandbox/mission";
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

const DEMO_STORAGE_VERSION = "v3";

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

function isCompatibleSession(spec: SandboxSpec, session: SandboxSession): boolean {
  const stepIds = new Set(spec.guided_steps.map((step) => step.id));
  const questionIds = new Set(spec.reflection_questions.map((question) => question.id));
  return spec.variables.every((variable) => {
    const value = session.responses[variable.id];
    return typeof value === "number" && Number.isFinite(value) && value >= variable.min && value <= variable.max;
  })
    && session.completed_step_ids.every((stepId) => stepIds.has(stepId))
    && session.reflection_answers.every((answer) => questionIds.has(answer.question_id))
    && session.hints_used >= 0
    && session.hints_used <= 3;
}

export function createDemoSandboxApi(spec: SandboxSpec, storage: Storage = window.localStorage): DemoSandboxApi {
  const storageKey = `prism-sandbox-demo:${DEMO_STORAGE_VERSION}:${spec.title}`;
  const readState = (): StoredDemoState | null => {
    const raw = storage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as StoredDemoState) : null;
  };
  const writeState = (state: StoredDemoState) => storage.setItem(storageKey, JSON.stringify(state));
  const requireState = (): StoredDemoState => {
    const state = readState();
    if (!state) throw new SandboxApiError(404, "SESSION_NOT_FOUND", "The demo session has not started.");
    return state;
  };

  return {
    async startAssignment(_assignmentId: string): Promise<StartAssignmentResponse> {
      const existing = readState();
      const state = existing && isCompatibleSession(spec, existing.session) ? existing : { session: createSession(spec) };
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
        throw new SandboxApiError(409, "SESSION_VERSION_CONFLICT", "The demo session has a newer version.");
      }
      const completedStepIds = [...new Set([...request.completed_step_ids, ...automaticallyCompletedStepIds(spec, request.responses, request.reflection_answers)])].sort();
      const nextSession: SandboxSession = {
        ...state.session,
        completed_step_ids: completedStepIds,
        responses: request.responses,
        reflection_answers: request.reflection_answers,
      };
      if (!isCompatibleSession(spec, nextSession)) {
        throw new SandboxApiError(422, "INVALID_PROGRESS", "Demo progress must match the active sandbox specification.");
      }
      const missionEvaluation = spec.mission ? evaluateMission(spec, request.responses) : undefined;
      const events = [...(state.session.interaction_events ?? [])];
      if (request.experiment_event) {
        events.push({ ...request.experiment_event, outputs: missionEvaluation?.outputs, mission_complete: Boolean(missionEvaluation?.complete) });
      }
      state.session = {
        ...nextSession,
        version: state.session.version + 1,
        mission_evaluation: missionEvaluation,
        interaction_events: events.slice(-20),
        updated_at: new Date().toISOString(),
      };
      writeState(state);
      return state.session;
    },

    async requestHint(_sessionId: string, _question?: string, currentStepId?: string): Promise<HintResponse> {
      const state = requireState();
      if (state.session.hints_used >= 3) {
        throw new SandboxApiError(429, "HINT_LIMIT_REACHED", "No more hints are available for this session.");
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
        throw new SandboxApiError(409, "SESSION_VERSION_CONFLICT", "The demo session has a newer version.");
      }
      const rulesSatisfied = completionRulesSatisfied(spec, state.session.completed_step_ids, reflectionAnswers);
      const recordedMissionComplete = !spec.mission || Boolean(state.session.interaction_events?.some((event) => event.event_type === "experiment_run" && event.mission_complete));
      if (!rulesSatisfied || !recordedMissionComplete) {
        throw new SandboxApiError(409, "SANDBOX_INCOMPLETE", "Complete the required steps and record a successful experiment before submitting.");
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
