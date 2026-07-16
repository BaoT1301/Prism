export type SandboxType = "parameter_explorer";
export type FormulaId = "force_equals_mass_times_acceleration";
export type VisualTheme = "basketball" | "formula1" | "space";

export interface SandboxVariable {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  default: number;
  editable: boolean;
}

export interface GuidedStep {
  id: string;
  instruction: string;
  completion_checks?: CompletionCheck[];
}

export type CompletionCheckType = "value_changed" | "value_increased" | "value_decreased" | "reflection_answered";

export interface CompletionCheck {
  type: CompletionCheckType;
  variable_id?: string | null;
  question_id?: string | null;
}

export type CompletionRuleType =
  | "step_completed"
  | "all_steps_completed"
  | "reflection_answered";

export interface CompletionRule {
  type: CompletionRuleType;
  step_id?: string | null;
}

export interface ReflectionQuestion {
  id: string;
  question: string;
}

export interface SandboxSpec {
  version: 1;
  sandbox_type: SandboxType;
  visual_theme?: VisualTheme;
  title: string;
  introduction: string;
  formula_id: FormulaId;
  variables: SandboxVariable[];
  guided_steps: GuidedStep[];
  completion_rules: CompletionRule[];
  reflection_questions: ReflectionQuestion[];
}

export interface SandboxSession {
  id: string;
  version: number;
  status: "in_progress" | "completed" | "submitted";
  completed_step_ids: string[];
  responses: Record<string, number>;
  hints_used: number;
  updated_at?: string;
  submitted_at?: string;
}

export interface StartAssignmentResponse {
  generated_assignment: {
    id: string;
    assignment_id: string;
    student_id: string;
    personalized_title: string;
    scenario: string;
    problem_statement: string;
    learning_objective: string;
    instructions: string[];
    reflection_questions: ReflectionQuestion[] | string[];
    sandbox_spec: SandboxSpec;
    generated_at: string;
  };
  cache_status: "hit" | "miss";
  session: {
    id: string;
    status: SandboxSession["status"];
    progress: {
      completed_step_ids: string[];
      responses: Record<string, number>;
    };
  };
}

export interface SandboxLaunch {
  assignment: StartAssignmentResponse["generated_assignment"];
  session: SandboxSession;
  cache_status: StartAssignmentResponse["cache_status"];
}

export interface ProgressRequest {
  expected_version: number;
  completed_step_ids: string[];
  responses: Record<string, number>;
}

export interface ProgressResponse extends SandboxSession {
  version: number;
}

export interface HintResponse {
  hint_level: number;
  hint: string;
  remaining_hint_levels: number;
}

export interface SubmissionResponse {
  id: string;
  assignment_id: string;
  student_id: string;
  status: "submitted";
  submitted_at: string;
}

export interface ReflectionAnswer {
  question_id: string;
  answer: string;
}
