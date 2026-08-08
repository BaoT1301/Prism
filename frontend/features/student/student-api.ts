import { apiRequest, type AccessTokenProvider } from "../../lib/api-client";
import { ensureArray } from "../../lib/guards";

/** The reviewed slice a student sees — a subset of the teacher-side `Review`. */
export type StudentReview = { score: number | null; feedback: string; reviewed_at: string };
export type StudentSubmission = { assignment_id: string; assignment_title: string; submitted_at: string; review: StudentReview | null };

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
  };
}

export type StudentApi = ReturnType<typeof createStudentApi>;
