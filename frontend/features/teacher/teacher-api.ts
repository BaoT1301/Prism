import { apiRequest, type AccessTokenProvider } from "../../lib/api-client";
import { ensureArray, ensureCollectionShape, toFiniteNumber } from "../../lib/guards";
import type { ReflectionAnswer } from "../sandbox/sandbox-types";

export type Profile = { id: string; email: string; display_name: string; role: "teacher" | "student"; created_at: string };
export type ClassSummary = { id: string; name: string; subject: string; grade_level: string; description?: string | null; join_code: string; student_count: number; assignment_count: number; created_at: string; archived_at?: string | null };
export type Assignment = { id: string; class_id: string; title: string; topic: string; learning_objective: string; grade_level: string; instructions?: string | null; sandbox_type: "parameter_explorer"; status: "draft" | "published" | "archived"; content_version: number; published_at?: string | null; created_at: string };
export type Member = { student_id: string; display_name: string; joined_at: string };
export type Review = { id: string; submission_id: string; score: number | null; feedback: string; reviewer_name: string; reviewed_at: string };
export type ReviewInput = { score: number | null; feedback: string };
export type Submission = { submission_id: string; student_id: string; student_name: string; status: string; submitted_at?: string | null; review: Review | null };
export type SubmissionDetail = { submission_id: string; assignment_id: string; student_id: string; student_name: string; status: string; submitted_at?: string | null; responses_snapshot: Record<string, number>; reflection_answers: ReflectionAnswer[]; review: Review | null };
export type AssignmentProgress = { student_id: string; student_name: string; status: "not_started" | "in_progress" | "submitted"; completed_steps: number; total_steps: number; hints_used: number; submitted_at?: string | null };
export type ChoiceBreakdown = { label: string; count: number };
export type ReflectionBreakdown = { question_id: string; prompt: string; responses: number; choices: ChoiceBreakdown[] };
export type AssignmentAnalytics = {
  assignment_id: string;
  roster_total: number;
  funnel: { not_started: number; in_progress: number; submitted: number };
  completion_rate: number;
  hints: { average: number; max: number };
  median_seconds_to_submit: number | null;
  reflection_breakdown: ReflectionBreakdown[];
};
export type Collection<T> = { items: T[]; total: number };
export type ClassInput = Pick<ClassSummary, "name" | "subject" | "grade_level" | "description">;
export type ClassUpdate = { name?: string; description?: string | null };
export type AssignmentInput = Pick<Assignment, "title" | "topic" | "learning_objective" | "grade_level" | "instructions" | "sandbox_type">;
export type AuditEntry = { action: string; target_type: string; target_id: string; created_at: string };

/**
 * Runtime normalizers for the new grading/analytics endpoints. The backend is
 * being built in parallel, so these coerce every number, guard every array, and
 * collapse a malformed `review` to `null` — nothing here can crash a `.map` or
 * render `NaN`, even if the wire shape drifts.
 */
/**
 * Coerces an untrusted class payload into the shape the teacher UI relies on.
 * The lifecycle endpoints (rename/archive/regenerate) are built in parallel, so
 * every field is guarded — a missing `archived_at` collapses to `null` (active),
 * counts to `0`, and strings to `""`, so nothing here can crash a render.
 */
function normalizeClass(value: ClassSummary | null | undefined): ClassSummary {
  const source = (value ?? {}) as Partial<ClassSummary>;
  return {
    id: typeof source.id === "string" ? source.id : "",
    name: typeof source.name === "string" ? source.name : "",
    subject: typeof source.subject === "string" ? source.subject : "",
    grade_level: typeof source.grade_level === "string" ? source.grade_level : "",
    description: typeof source.description === "string" ? source.description : null,
    join_code: typeof source.join_code === "string" ? source.join_code : "",
    student_count: toFiniteNumber(source.student_count, 0),
    assignment_count: toFiniteNumber(source.assignment_count, 0),
    created_at: typeof source.created_at === "string" ? source.created_at : "",
    archived_at: typeof source.archived_at === "string" ? source.archived_at : null,
  };
}

/**
 * Pulls a fresh join code out of either supported regenerate response shape:
 * a bare `{ join_code }` or a full updated class that carries `join_code`.
 */
function normalizeJoinCode(value: { join_code?: unknown } | null | undefined): { join_code: string } {
  return { join_code: typeof value?.join_code === "string" ? value.join_code : "" };
}

function normalizeAuditEntry(value: Partial<AuditEntry> | null | undefined): AuditEntry {
  return {
    action: typeof value?.action === "string" ? value.action : "",
    target_type: typeof value?.target_type === "string" ? value.target_type : "",
    target_id: typeof value?.target_id === "string" ? value.target_id : "",
    created_at: typeof value?.created_at === "string" ? value.created_at : "",
  };
}

function normalizeReview(value: Review | null | undefined): Review | null {
  if (!value || typeof value !== "object") return null;
  return {
    id: typeof value.id === "string" ? value.id : "",
    submission_id: typeof value.submission_id === "string" ? value.submission_id : "",
    score: typeof value.score === "number" && Number.isFinite(value.score) ? value.score : null,
    feedback: typeof value.feedback === "string" ? value.feedback : "",
    reviewer_name: typeof value.reviewer_name === "string" ? value.reviewer_name : "",
    reviewed_at: typeof value.reviewed_at === "string" ? value.reviewed_at : "",
  };
}

function normalizeSubmissionItem(value: Submission): Submission {
  return {
    submission_id: typeof value?.submission_id === "string" ? value.submission_id : "",
    student_id: typeof value?.student_id === "string" ? value.student_id : "",
    student_name: typeof value?.student_name === "string" ? value.student_name : "Student",
    status: typeof value?.status === "string" ? value.status : "",
    submitted_at: typeof value?.submitted_at === "string" ? value.submitted_at : null,
    review: normalizeReview(value?.review),
  };
}

function normalizeSubmissionDetail(value: SubmissionDetail): SubmissionDetail {
  const snapshot: Record<string, number> = {};
  const responses = value?.responses_snapshot;
  if (responses && typeof responses === "object") {
    for (const [key, raw] of Object.entries(responses)) {
      const parsed = toFiniteNumber(raw, Number.NaN);
      if (Number.isFinite(parsed)) snapshot[key] = parsed;
    }
  }
  return {
    submission_id: typeof value?.submission_id === "string" ? value.submission_id : "",
    assignment_id: typeof value?.assignment_id === "string" ? value.assignment_id : "",
    student_id: typeof value?.student_id === "string" ? value.student_id : "",
    student_name: typeof value?.student_name === "string" ? value.student_name : "Student",
    status: typeof value?.status === "string" ? value.status : "submitted",
    submitted_at: typeof value?.submitted_at === "string" ? value.submitted_at : null,
    responses_snapshot: snapshot,
    reflection_answers: ensureArray(value?.reflection_answers).map((answer) => ({
      question_id: typeof answer?.question_id === "string" ? answer.question_id : "",
      answer: typeof answer?.answer === "string" ? answer.answer : "",
    })),
    review: normalizeReview(value?.review),
  };
}

function normalizeAnalytics(value: AssignmentAnalytics): AssignmentAnalytics {
  const funnel = value?.funnel;
  const hints = value?.hints;
  const median = value?.median_seconds_to_submit;
  return {
    assignment_id: typeof value?.assignment_id === "string" ? value.assignment_id : "",
    roster_total: toFiniteNumber(value?.roster_total, 0),
    funnel: {
      not_started: toFiniteNumber(funnel?.not_started, 0),
      in_progress: toFiniteNumber(funnel?.in_progress, 0),
      submitted: toFiniteNumber(funnel?.submitted, 0),
    },
    completion_rate: toFiniteNumber(value?.completion_rate, 0),
    hints: { average: toFiniteNumber(hints?.average, 0), max: toFiniteNumber(hints?.max, 0) },
    median_seconds_to_submit: typeof median === "number" && Number.isFinite(median) ? median : null,
    reflection_breakdown: ensureArray(value?.reflection_breakdown).map((entry) => ({
      question_id: typeof entry?.question_id === "string" ? entry.question_id : "",
      prompt: typeof entry?.prompt === "string" ? entry.prompt : "",
      responses: toFiniteNumber(entry?.responses, 0),
      choices: ensureArray(entry?.choices).map((choice) => ({
        label: typeof choice?.label === "string" ? choice.label : "",
        count: toFiniteNumber(choice?.count, 0),
      })),
    })),
  };
}

export function createTeacherApi(getAccessToken?: AccessTokenProvider) {
  return {
    me: () => apiRequest<Profile>("/api/v1/me", {}, getAccessToken),
    bootstrap: (display_name: string) => apiRequest<Profile>("/api/v1/profiles/bootstrap", { method: "POST", body: JSON.stringify({ display_name, role: "teacher" }) }, getAccessToken),
    classes: async (includeArchived = false) => {
      const collection = ensureCollectionShape(await apiRequest<Collection<ClassSummary>>(`/api/v1/classes${includeArchived ? "?include_archived=true" : ""}`, {}, getAccessToken));
      return { items: collection.items.map(normalizeClass), total: collection.total };
    },
    createClass: async (body: ClassInput) => normalizeClass(await apiRequest<ClassSummary>("/api/v1/classes", { method: "POST", body: JSON.stringify(body) }, getAccessToken)),
    classDetail: async (id: string) => normalizeClass(await apiRequest<ClassSummary>(`/api/v1/classes/${id}`, {}, getAccessToken)),
    updateClass: async (id: string, body: ClassUpdate) => normalizeClass(await apiRequest<ClassSummary>(`/api/v1/classes/${id}`, { method: "PATCH", body: JSON.stringify(body) }, getAccessToken)),
    archiveClass: async (id: string) => normalizeClass(await apiRequest<ClassSummary>(`/api/v1/classes/${id}/archive`, { method: "POST" }, getAccessToken)),
    unarchiveClass: async (id: string) => normalizeClass(await apiRequest<ClassSummary>(`/api/v1/classes/${id}/unarchive`, { method: "POST" }, getAccessToken)),
    regenerateJoinCode: async (id: string) => normalizeJoinCode(await apiRequest<{ join_code?: string }>(`/api/v1/classes/${id}/join-code/regenerate`, { method: "POST" }, getAccessToken)),
    removeMember: (id: string, studentId: string) => apiRequest<void>(`/api/v1/classes/${id}/members/${studentId}`, { method: "DELETE" }, getAccessToken),
    deleteAccount: () => apiRequest<void>("/api/v1/me", { method: "DELETE" }, getAccessToken),
    audit: async () => {
      const raw = await apiRequest<AuditEntry[] | { items?: AuditEntry[] }>("/api/v1/me/audit", {}, getAccessToken);
      return ensureArray(Array.isArray(raw) ? raw : raw?.items).map(normalizeAuditEntry);
    },
    members: async (id: string) => ensureCollectionShape(await apiRequest<Collection<Member>>(`/api/v1/classes/${id}/members`, {}, getAccessToken)),
    assignments: async (id: string) => ensureCollectionShape(await apiRequest<Collection<Assignment>>(`/api/v1/classes/${id}/assignments`, {}, getAccessToken)),
    createAssignment: (classId: string, body: AssignmentInput) => apiRequest<Assignment>(`/api/v1/classes/${classId}/assignments`, { method: "POST", body: JSON.stringify(body) }, getAccessToken),
    assignment: (id: string) => apiRequest<Assignment>(`/api/v1/assignments/${id}`, {}, getAccessToken),
    updateAssignment: (id: string, body: Partial<AssignmentInput>) => apiRequest<Assignment>(`/api/v1/assignments/${id}`, { method: "PATCH", body: JSON.stringify(body) }, getAccessToken),
    publishAssignment: (id: string) => apiRequest<Assignment>(`/api/v1/assignments/${id}/publish`, { method: "POST" }, getAccessToken),
    submissions: async (id: string) => {
      const collection = ensureCollectionShape(await apiRequest<Collection<Submission>>(`/api/v1/assignments/${id}/submissions`, {}, getAccessToken));
      return { items: collection.items.map(normalizeSubmissionItem), total: collection.total };
    },
    submissionDetail: async (submissionId: string) => normalizeSubmissionDetail(await apiRequest<SubmissionDetail>(`/api/v1/submissions/${submissionId}`, {}, getAccessToken)),
    saveReview: async (submissionId: string, body: ReviewInput): Promise<Review> => {
      const saved = normalizeReview(await apiRequest<Review>(`/api/v1/submissions/${submissionId}/review`, { method: "PUT", body: JSON.stringify(body) }, getAccessToken));
      // A well-behaved PUT always echoes the saved review; fall back to the input
      // so the UI can still reflect "saved" state if the body ever comes back thin.
      return saved ?? { id: "", submission_id: submissionId, score: body.score, feedback: body.feedback, reviewer_name: "", reviewed_at: new Date().toISOString() };
    },
    analytics: async (id: string) => normalizeAnalytics(await apiRequest<AssignmentAnalytics>(`/api/v1/assignments/${id}/analytics`, {}, getAccessToken)),
    progress: async (id: string) => ensureCollectionShape(await apiRequest<Collection<AssignmentProgress>>(`/api/v1/assignments/${id}/progress`, {}, getAccessToken)),
  };
}
export type TeacherApi = ReturnType<typeof createTeacherApi>;
