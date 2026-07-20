export type SandboxType = "parameter_explorer" | "graph_lab" | "guided_activity";
export type FormulaId = "force_equals_mass_times_acceleration";
export type VisualTheme = "basketball" | "formula1" | "space";
export type PersonalSceneSetting = "court" | "racetrack" | "launchpad" | "music_room" | "gaming_desk" | "art_studio" | "city_park" | "workshop" | "science_lab" | "kitchen" | "concert_stage" | "ocean" | "mountain_trail" | "animal_sanctuary" | "sports_gym" | "library";
export type PersonalSceneProp = "basketball" | "race_car" | "rocket" | "guitar" | "controller" | "sketchbook" | "soccer_ball" | "camera" | "skateboard" | "book_stack" | "headphones" | "plant" | "microscope" | "robot" | "chef_hat" | "surfboard" | "animal_friend" | "dumbbell" | "chess_piece" | "drone" | "flower" | "paint_palette" | "tennis_racket" | "planet" | "laptop" | "baseball";
export type PersonalSceneMood = "daylight" | "sunset" | "neon" | "starlight";

export interface PersonalScene {
  setting: PersonalSceneSetting;
  primary_prop: PersonalSceneProp;
  accent_props: PersonalSceneProp[];
  mood: PersonalSceneMood;
  label: string;
}

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

export type MissionOperator = "greater_than_or_equal" | "less_than_or_equal" | "between";

export interface MissionConstraint {
  id: string;
  label: string;
  field: string;
  operator: MissionOperator;
  value?: number;
  min?: number;
  max?: number;
}

export interface MissionEvaluation {
  complete: boolean;
  outputs: Record<string, number>;
  constraints: Array<{ id: string; label: string; satisfied: boolean; current_value: number | null; message: string }>;
  bonus: { enabled: boolean; complete: boolean; attempted: boolean };
}

export interface SandboxMission {
  schema_version: "1.0";
  evaluator_version: "numeric-v1";
  template_id: string;
  title: string;
  context: string;
  objective: string;
  controls: Array<{ variable_id: string }>;
  calculated_outputs: Array<{ id: string; label: string; formula_id: FormulaId; unit: string }>;
  visible_constraints: MissionConstraint[];
  success_condition: { operator: "AND"; constraint_ids: string[] };
  bonus_condition: { enabled: boolean; type: "distinct_second_solution"; description: string; minimum_difference?: Record<string, number> };
}

export interface SandboxSpec {
  version: 1;
  sandbox_type: SandboxType;
  visual_theme?: VisualTheme;
  /** AI-selected composition from the finite renderer-owned 3D catalog. */
  personal_scene?: PersonalScene;
  title: string;
  introduction: string;
  formula_id: FormulaId;
  variables: SandboxVariable[];
  guided_steps: GuidedStep[];
  completion_rules: CompletionRule[];
  reflection_questions: ReflectionQuestion[];
  /** Optional so existing cached assignments remain usable after the mission enhancement. */
  mission?: SandboxMission;
}

export interface SandboxSession {
  id: string;
  version: number;
  status: "in_progress" | "completed" | "submitted";
  completed_step_ids: string[];
  responses: Record<string, number>;
  reflection_answers: ReflectionAnswer[];
  hints_used: number;
  updated_at?: string;
  submitted_at?: string;
  mission_evaluation?: MissionEvaluation;
  interaction_events?: InteractionEvent[];
  feedback?: AdaptiveFeedback;
}

export interface InteractionEvent {
  event_type: "experiment_run" | "hint_requested";
  recorded_at: string;
  elapsed_ms?: number;
  values?: Record<string, number>;
  controlled_comparison?: boolean;
  /** Server-calculated fields returned in session history, never sent by the client. */
  outputs?: Record<string, number>;
  mission_complete?: boolean;
  bonus_attempted?: boolean;
}

export interface ExperimentEventRequest {
  event_type: "experiment_run";
  recorded_at: string;
  elapsed_ms?: number;
  values: Record<string, number>;
  controlled_comparison?: boolean;
}

export interface AdaptiveFeedback {
  status: "pending" | "ready" | "failed";
  concepts_mastered: string[];
  areas_of_confusion: string[];
  explanation: string;
  recommended_next_steps: string[];
  follow_up_practice: string;
  teacher_summary?: Record<string, unknown>;
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
    reflection_questions: ReflectionQuestion[];
    sandbox_spec: SandboxSpec;
    generated_at: string;
  };
  cache_status: "hit" | "miss";
  session: SandboxSession;
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
  reflection_answers: ReflectionAnswer[];
  experiment_event?: ExperimentEventRequest;
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
  feedback?: AdaptiveFeedback;
}

export interface ReflectionAnswer {
  question_id: string;
  answer: string;
}
