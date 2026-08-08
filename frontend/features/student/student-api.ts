import { apiRequest, type AccessTokenProvider } from "../../lib/api-client";
import { ensureArray } from "../../lib/guards";

/** The reviewed slice a student sees — a subset of the teacher-side `Review`. */
export type StudentReview = { score: number | null; feedback: string; reviewed_at: string };
export type StudentSubmission = { assignment_id: string; assignment_title: string; submitted_at: string; review: StudentReview | null };

/** Personalization/generation lifecycle for an assignment launch. */
export type GenerationStatus = "none" | "pending" | "completed" | "failed";

/**
 * Coerces the generation-status payload to a known state. Anything unexpected
 * degrades to `"pending"` so the launch UI keeps waiting (bounded by the poller's
 * own attempt cap) rather than surfacing a false failure on transient drift.
 */
function normalizeGenerationStatus(value: { status?: unknown } | null | undefined): GenerationStatus {
  const status = value?.status;
  return status === "none" || status === "pending" || status === "completed" || status === "failed" ? status : "pending";
}

function normalizeReview(value: StudentReview | null | undefined): StudentReview | null {
  if (!value || typeof value !== "object") return null;
  return {
    score: typeof value.score === "number" && Number.isFinite(value.score) ? value.score : null,
    feedback: typeof value.feedback === "string" ? value.feedback : "",
    reviewed_at: typeof value.reviewed_at === "string" ? value.reviewed_at : "",
  };
}

function normalizeSubmissions(value: StudentSubmission[]): StudentSubmission[] {
  return ensureArray(value).map((item) => ({
    assignment_id: typeof item?.assignment_id === "string" ? item.assignment_id : "",
    assignment_title: typeof item?.assignment_title === "string" ? item.assignment_title : "Assignment",
    submitted_at: typeof item?.submitted_at === "string" ? item.submitted_at : "",
    review: normalizeReview(item?.review),
  }));
}

export function createStudentApi(getAccessToken?: AccessTokenProvider) {
  return {
    // `/me/submissions` returns a bare array, newest first — guarded into a safe,
    // normalized array so the feedback list can never crash on shape drift.
    mySubmissions: async (signal?: AbortSignal) =>
      normalizeSubmissions(await apiRequest<StudentSubmission[]>("/api/v1/me/submissions", { signal }, getAccessToken)),
    // Polled while an assignment personalization is in flight.
    generationStatus: async (assignmentId: string, signal?: AbortSignal): Promise<GenerationStatus> =>
      normalizeGenerationStatus(await apiRequest<{ status?: string }>(`/api/v1/assignments/${assignmentId}/generation-status`, { signal }, getAccessToken)),
    deleteAccount: () => apiRequest<void>("/api/v1/me", { method: "DELETE" }, getAccessToken),
  };
}

export type StudentApi = ReturnType<typeof createStudentApi>;
