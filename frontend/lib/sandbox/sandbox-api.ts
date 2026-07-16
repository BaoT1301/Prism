import type { HintResponse, ProgressRequest, ProgressResponse, ReflectionAnswer, SandboxLaunch, SandboxSession, StartAssignmentResponse, SubmissionResponse } from "../../features/sandbox/sandbox-types";

export class SandboxApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "SandboxApiError";
  }
}

export interface SandboxApi {
  startAssignment(assignmentId: string): Promise<StartAssignmentResponse>;
  launchAssignment(assignmentId: string): Promise<SandboxLaunch>;
  getSession(sessionId: string): Promise<SandboxSession>;
  updateProgress(sessionId: string, request: ProgressRequest): Promise<ProgressResponse>;
  requestHint(sessionId: string, question?: string, currentStepId?: string): Promise<HintResponse>;
  submit(sessionId: string, expectedSessionVersion: number, reflectionAnswers: ReflectionAnswer[]): Promise<SubmissionResponse>;
}

async function request<T>(baseUrl: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new SandboxApiError(response.status, body?.error?.code ?? "REQUEST_FAILED", body?.error?.message ?? "Sandbox request failed.");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function createSandboxApi(baseUrl = "", getAccessToken?: () => Promise<string | null>): SandboxApi {
  async function authHeaders(): Promise<HeadersInit> {
    const token = await getAccessToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  return {
    startAssignment: async (assignmentId) => request(baseUrl, `/api/v1/assignments/${assignmentId}/start`, { method: "POST", headers: await authHeaders() }),
    launchAssignment: async (assignmentId) => {
      const started = await request<StartAssignmentResponse>(baseUrl, `/api/v1/assignments/${assignmentId}/start`, { method: "POST", headers: await authHeaders() });
      const session = await request<SandboxSession>(baseUrl, `/api/v1/sandbox-sessions/${started.session.id}`, { headers: await authHeaders() });
      return { assignment: started.generated_assignment, session, cache_status: started.cache_status };
    },
    getSession: async (sessionId) => request(baseUrl, `/api/v1/sandbox-sessions/${sessionId}`, { headers: await authHeaders() }),
    updateProgress: async (sessionId, body) => request(baseUrl, `/api/v1/sandbox-sessions/${sessionId}/progress`, { method: "PATCH", headers: await authHeaders(), body: JSON.stringify(body) }),
    requestHint: async (sessionId, question, currentStepId) => request(baseUrl, `/api/v1/sandbox-sessions/${sessionId}/hint`, { method: "POST", headers: await authHeaders(), body: JSON.stringify({ question, current_step_id: currentStepId }) }),
    submit: async (sessionId, expectedSessionVersion, reflectionAnswers) => request(baseUrl, `/api/v1/sandbox-sessions/${sessionId}/submit`, { method: "POST", headers: await authHeaders(), body: JSON.stringify({ expected_session_version: expectedSessionVersion, reflection_answers: reflectionAnswers }) }),
  };
}
