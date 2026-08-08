import type { HintResponse, ProgressRequest, ProgressResponse, ReflectionAnswer, SandboxLaunch, SandboxSession, StartAssignmentResponse, SubmissionResponse } from "../../features/sandbox/sandbox-types";
import { sanitizeSession } from "../../features/sandbox/session-sync";
import { apiRequest, ApiError, type AccessTokenProvider } from "../api-client";

// The sandbox layer shares the app-wide `ApiError`; `SandboxApiError` remains as
// an alias so existing imports keep working while there is only one error type.
export { ApiError as SandboxApiError };

export interface SandboxApi {
  startAssignment(assignmentId: string): Promise<StartAssignmentResponse>;
  launchAssignment(assignmentId: string): Promise<SandboxLaunch>;
  getSession(sessionId: string): Promise<SandboxSession>;
  updateProgress(sessionId: string, request: ProgressRequest): Promise<ProgressResponse>;
  requestHint(sessionId: string, question?: string, currentStepId?: string): Promise<HintResponse>;
  submit(sessionId: string, expectedSessionVersion: number, reflectionAnswers: ReflectionAnswer[]): Promise<SubmissionResponse>;
}

export function createSandboxApi(getAccessToken?: AccessTokenProvider): SandboxApi {
  return {
    startAssignment: (assignmentId) =>
      apiRequest<StartAssignmentResponse>(`/api/v1/assignments/${assignmentId}/start`, { method: "POST" }, getAccessToken),
    launchAssignment: async (assignmentId) => {
      const started = await apiRequest<StartAssignmentResponse>(`/api/v1/assignments/${assignmentId}/start`, { method: "POST" }, getAccessToken);
      return { assignment: started.generated_assignment, session: sanitizeSession(started.session), cache_status: started.cache_status };
    },
    getSession: async (sessionId) =>
      sanitizeSession(await apiRequest<SandboxSession>(`/api/v1/sandbox-sessions/${sessionId}`, {}, getAccessToken)),
    updateProgress: async (sessionId, body) => {
      const latest = await apiRequest<ProgressResponse>(`/api/v1/sandbox-sessions/${sessionId}/progress`, { method: "PATCH", body: JSON.stringify(body) }, getAccessToken);
      return sanitizeSession(latest) as ProgressResponse;
    },
    requestHint: (sessionId, question, currentStepId) =>
      apiRequest<HintResponse>(`/api/v1/sandbox-sessions/${sessionId}/hint`, { method: "POST", body: JSON.stringify({ question, current_step_id: currentStepId }) }, getAccessToken),
    submit: (sessionId, expectedSessionVersion, reflectionAnswers) =>
      apiRequest<SubmissionResponse>(`/api/v1/sandbox-sessions/${sessionId}/submit`, { method: "POST", body: JSON.stringify({ expected_session_version: expectedSessionVersion, reflection_answers: reflectionAnswers }) }, getAccessToken),
  };
}
