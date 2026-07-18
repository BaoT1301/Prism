import { apiRequest, type AccessTokenProvider } from "../../lib/api-client";

export type Profile = { id: string; email: string; display_name: string; role: "teacher" | "student"; created_at: string };
export type ClassSummary = { id: string; name: string; subject: string; grade_level: string; description?: string | null; join_code: string; student_count: number; assignment_count: number; created_at: string };
export type Assignment = { id: string; class_id: string; title: string; topic: string; learning_objective: string; grade_level: string; instructions?: string | null; sandbox_type: "parameter_explorer"; status: "draft" | "published" | "archived"; content_version: number; published_at?: string | null; created_at: string };
export type Member = { student_id: string; display_name: string; joined_at: string };
export type Submission = { submission_id: string; student_id: string; student_name: string; status: string; submitted_at?: string | null };
export type AssignmentProgress = { student_id: string; student_name: string; status: "not_started" | "in_progress" | "submitted"; completed_steps: number; total_steps: number; hints_used: number; submitted_at?: string | null };
export type Collection<T> = { items: T[]; total: number };
export type ClassInput = Pick<ClassSummary, "name" | "subject" | "grade_level" | "description">;
export type AssignmentInput = Pick<Assignment, "title" | "topic" | "learning_objective" | "grade_level" | "instructions" | "sandbox_type">;

export function createTeacherApi(getAccessToken?: AccessTokenProvider) {
  return {
    me: () => apiRequest<Profile>("/api/v1/me", {}, getAccessToken),
    bootstrap: (display_name: string) => apiRequest<Profile>("/api/v1/profiles/bootstrap", { method: "POST", body: JSON.stringify({ display_name, role: "teacher" }) }, getAccessToken),
    classes: () => apiRequest<Collection<ClassSummary>>("/api/v1/classes", {}, getAccessToken),
    createClass: (body: ClassInput) => apiRequest<ClassSummary>("/api/v1/classes", { method: "POST", body: JSON.stringify(body) }, getAccessToken),
    classDetail: (id: string) => apiRequest<ClassSummary>(`/api/v1/classes/${id}`, {}, getAccessToken),
    members: (id: string) => apiRequest<Collection<Member>>(`/api/v1/classes/${id}/members`, {}, getAccessToken),
    assignments: (id: string) => apiRequest<Collection<Assignment>>(`/api/v1/classes/${id}/assignments`, {}, getAccessToken),
    createAssignment: (classId: string, body: AssignmentInput) => apiRequest<Assignment>(`/api/v1/classes/${classId}/assignments`, { method: "POST", body: JSON.stringify(body) }, getAccessToken),
    assignment: (id: string) => apiRequest<Assignment>(`/api/v1/assignments/${id}`, {}, getAccessToken),
    updateAssignment: (id: string, body: Partial<AssignmentInput>) => apiRequest<Assignment>(`/api/v1/assignments/${id}`, { method: "PATCH", body: JSON.stringify(body) }, getAccessToken),
    publishAssignment: (id: string) => apiRequest<Assignment>(`/api/v1/assignments/${id}/publish`, { method: "POST" }, getAccessToken),
    submissions: (id: string) => apiRequest<Collection<Submission>>(`/api/v1/assignments/${id}/submissions`, {}, getAccessToken),
    progress: (id: string) => apiRequest<Collection<AssignmentProgress>>(`/api/v1/assignments/${id}/progress`, {}, getAccessToken),
  };
}
export type TeacherApi = ReturnType<typeof createTeacherApi>;
