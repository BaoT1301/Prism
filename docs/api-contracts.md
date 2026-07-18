# API Contracts

## 1. Conventions

Base path:

```text
/api/v1
```

Content type:

```text
application/json
```

Authentication:

```text
Authorization: Bearer <clerk_session_token>
```

IDs are UUID strings. Timestamps are ISO 8601 UTC strings.

The generated OpenAPI document is authoritative for machine consumers. This document describes intended behavior and must remain synchronized with implementation.

## 2. Standard errors

Use a predictable error object:

```json
{
  "error": {
    "code": "CLASS_NOT_FOUND",
    "message": "The requested class was not found.",
    "request_id": "01J..."
  }
}
```

Suggested status mapping:

- `400`: invalid state or malformed business request
- `401`: missing, invalid, or expired authentication
- `403`: authenticated but unauthorized
- `404`: resource not found or intentionally hidden
- `409`: uniqueness or state conflict
- `422`: typed request validation failure
- `429`: application or provider rate limit
- `500`: unexpected internal error
- `502`: upstream AI provider failure
- `503`: temporary dependency unavailable

Do not expose stack traces or database errors to clients.

## 3. Core enums

```text
UserRole:
- teacher
- student

AssignmentStatus:
- draft
- published
- archived

GenerationStatus:
- pending
- completed
- failed

SandboxType:
- parameter_explorer
- graph_lab
- guided_activity

SandboxSessionStatus:
- in_progress
- completed
- submitted
```

The MVP is required to implement only `parameter_explorer`. Other values may remain disabled until renderers exist.

## 4. Authentication and profile

### GET `/me`

Returns the authenticated application profile.

Response `200`:

```json
{
  "id": "f230f06d-a9b0-4e3c-b191-bf8c14ae6907",
  "auth_user_id": "user_2xExampleClerkUserId",
  "email": "teacher@example.com",
  "display_name": "Ms. Rivera",
  "role": "teacher",
  "created_at": "2026-07-15T20:00:00Z"
}
```

Errors:

- `401 AUTHENTICATION_REQUIRED`
- `401 INVALID_TOKEN`
- `404 PROFILE_NOT_PROVISIONED`

### POST `/profiles/bootstrap`

Creates the application profile after authenticated signup.

Request:

```json
{
  "display_name": "Bao Tran",
  "role": "teacher"
}
```

Response `201`: profile object.

Behavior:

- Uses `sub` and email from the verified token.
- Creates only one profile per auth user.
- A second identical call may return the existing profile.
- A conflicting role change returns `409 PROFILE_ALREADY_EXISTS`.
- Ordinary profile updates cannot change role.

## 5. Interest profile

### GET `/me/interests`

Student only.

Response `200`:

```json
{
  "id": "5a89f3ad-5313-44e9-af1e-d608d19eab02",
  "student_id": "f230f06d-a9b0-4e3c-b191-bf8c14ae6907",
  "version": 3,
  "sports": ["basketball"],
  "games": [],
  "movies": [],
  "hobbies": ["fitness"],
  "career_interests": ["software engineering"],
  "favorite_animals": [],
  "favorite_subjects": ["physics"],
  "additional_interests": [],
  "updated_at": "2026-07-15T20:10:00Z"
}
```

Errors:

- `404 INTEREST_PROFILE_NOT_FOUND`

### PUT `/me/interests`

Student only.

Request:

```json
{
  "sports": ["basketball"],
  "games": [],
  "movies": [],
  "hobbies": ["fitness"],
  "career_interests": ["software engineering"],
  "favorite_animals": [],
  "favorite_subjects": ["physics"],
  "additional_interests": []
}
```

Response `200`: saved profile with incremented version.

Validation:

- Trim strings.
- Remove empty values.
- Deduplicate case-insensitively.
- Apply documented field and item length limits.
- Limit number of items to prevent prompt abuse.

## 6. Classes

### POST `/classes`

Teacher only.

Request:

```json
{
  "name": "Physics 101",
  "subject": "Physics",
  "grade_level": "10",
  "description": "Introduction to mechanics"
}
```

Response `201`:

```json
{
  "id": "01d84d34-feb2-41c6-b9de-5a41e68fe344",
  "teacher_id": "f230f06d-a9b0-4e3c-b191-bf8c14ae6907",
  "name": "Physics 101",
  "subject": "Physics",
  "grade_level": "10",
  "description": "Introduction to mechanics",
  "join_code": "F7K29Q",
  "student_count": 0,
  "assignment_count": 0,
  "created_at": "2026-07-15T20:20:00Z"
}
```

The server generates the join code.

### GET `/classes`

Returns classes visible to the current user:

- Teacher: owned classes
- Student: joined classes

Response `200`:

```json
{
  "items": [],
  "total": 0
}
```

Use simple pagination only if needed:

```text
?limit=50&offset=0
```

### GET `/classes/{class_id}`

Returns class detail if visible to the user.

### DELETE `/classes/{class_id}`

Teacher owner only.

For the MVP, return `204`. Confirm cascade behavior in the database plan. Prefer preventing accidental deletion after submissions unless the product team explicitly chooses cascading hard deletes.

### POST `/classes/join`

Student only.

Request:

```json
{
  "join_code": "F7K29Q"
}
```

Response `200` or `201`:

```json
{
  "class_id": "01d84d34-feb2-41c6-b9de-5a41e68fe344",
  "student_id": "f230f06d-a9b0-4e3c-b191-bf8c14ae6907",
  "joined_at": "2026-07-15T20:30:00Z"
}
```

Behavior is idempotent. Joining an already joined class should not create a duplicate row.

### GET `/classes/{class_id}/members`

Teacher owner only.

Response:

```json
{
  "items": [
    {
      "student_id": "f230f06d-a9b0-4e3c-b191-bf8c14ae6907",
      "display_name": "Student One",
      "joined_at": "2026-07-15T20:30:00Z"
    }
  ],
  "total": 1
}
```

## 7. Assignments

### POST `/classes/{class_id}/assignments`

Teacher owner only.

Request:

```json
{
  "title": "Newton's Second Law Lab",
  "topic": "Newton's Second Law",
  "learning_objective": "Apply F = ma to calculate force, mass, or acceleration.",
  "grade_level": "10",
  "instructions": "Explore how changing mass and acceleration affects force.",
  "sandbox_type": "parameter_explorer"
}
```

Response `201`: assignment resource with `status: "draft"` and `content_version: 1`.

### GET `/classes/{class_id}/assignments`

- Teacher owner: drafts and published assignments
- Student member: published assignments only

### GET `/assignments/{assignment_id}`

Visibility follows class and publication rules.

### PATCH `/assignments/{assignment_id}`

Teacher owner only. Draft assignment changes increment `content_version`.

Request fields are optional:

```json
{
  "title": "Updated title",
  "instructions": "Updated instructions"
}
```

Published assignment editing policy for MVP:

- Either prevent edits with `409 ASSIGNMENT_ALREADY_PUBLISHED`, or
- Permit edits and increment `content_version`, causing new personalized generations.

Choose one behavior during implementation and document it. The safer MVP default is to prevent content edits after publication and allow only archive behavior.

### POST `/assignments/{assignment_id}/publish`

Teacher owner only.

Response `200`: assignment with `status: "published"` and `published_at`.

Idempotent if already published.

## 8. Start personalized assignment

### POST `/assignments/{assignment_id}/start`

Student class member only.

Request body may be empty.

Response `200`:

```json
{
  "generated_assignment": {
    "id": "c734a0dd-6b82-405e-9ddd-3dc78bd47f03",
    "assignment_id": "3f4d68af-9002-40a2-8e66-f2e5053b18b3",
    "student_id": "f230f06d-a9b0-4e3c-b191-bf8c14ae6907",
    "personalized_title": "Basketball Force Lab",
    "scenario": "Analyze how a basketball accelerates during a pass.",
    "problem_statement": "Adjust mass and acceleration and observe the required force.",
    "learning_objective": "Apply F = ma to calculate force, mass, or acceleration.",
    "instructions": [
      "Adjust the basketball mass.",
      "Adjust acceleration.",
      "Observe the force."
    ],
    "reflection_questions": [
      {
        "id": "reflection-1",
        "question": "What happened to force when acceleration increased?"
      }
    ],
    "sandbox_spec": {},
    "generated_at": "2026-07-15T21:00:00Z"
  },
  "cache_status": "hit",
  "session": {
    "id": "fbd69376-fc1b-478f-a650-b91bf697a655",
    "version": 1,
    "status": "in_progress",
    "completed_step_ids": [],
    "responses": {},
    "reflection_answers": [],
    "hints_used": 0,
    "submitted_at": null,
    "updated_at": "2026-07-15T21:00:00Z"
  }
}
```

Preconditions:

- Assignment exists.
- Assignment is published.
- Student belongs to class.
- Student has an interest profile.
- Sandbox type is supported.

Behavior:

- Idempotently returns the existing generation for the same assignment content version, student, and interest profile version.
- Creates or resumes an active session.
- Does not expose another student's generated content.
- Uses the validated deterministic personalization provider if live AI generation
  fails, preserving the objective and sandbox contract.

Possible errors:

- `403 NOT_A_CLASS_MEMBER`
- `409 ASSIGNMENT_NOT_PUBLISHED`
- `409 INTEREST_PROFILE_REQUIRED`
- `422 UNSUPPORTED_SANDBOX_TYPE`
- `502 PERSONALIZATION_FAILED`

## 9. Sandbox sessions

### GET `/sandbox-sessions/{session_id}`

Student owner only. Teacher access is not required for MVP.

### PATCH `/sandbox-sessions/{session_id}/progress`

Student owner only.

Request:

```json
{
  "expected_version": 4,
  "completed_step_ids": ["step-1", "step-2"],
  "responses": {
    "mass": 0.6,
    "acceleration": 8
  },
  "reflection_answers": [
    {
      "question_id": "reflection-1",
      "answer": "Force increases when acceleration increases."
    }
  ]
}
```

Response:

```json
{
  "id": "fbd69376-fc1b-478f-a650-b91bf697a655",
  "version": 5,
  "status": "in_progress",
  "completed_step_ids": ["step-1", "step-2"],
  "responses": {
    "mass": 0.6,
    "acceleration": 8
  },
  "reflection_answers": [
    {
      "question_id": "reflection-1",
      "answer": "Force increases when acceleration increases."
    }
  ],
  "hints_used": 0,
  "submitted_at": null,
  "updated_at": "2026-07-15T21:05:00Z"
}
```

Use optimistic concurrency to prevent stale updates. A mismatched `expected_version` returns `409 SESSION_VERSION_CONFLICT`.

`experiment_event` is an optional, bounded telemetry object for the mission-enhanced
parameter explorer. It accepts only `event_type: "experiment_run"`, `recorded_at`,
an optional `elapsed_ms`, the configured numeric `values`, and
`controlled_comparison`. The server calculates outputs and mission completion; clients
cannot supply either value. Session history retains at most 20 events.

`sandbox_spec.mission` is an optional backward-compatible enhancement. New
personalized assignments may include it to expose deterministic numeric constraints;
cached assignments without it continue to use the original guided-step completion
rules and remain submit-able.

`sandbox_spec.personal_scene` is also optional and presentation-only. It contains a
validated setting, primary prop, up to two accent props, mood, and display label from
the finite frontend catalog. The renderer owns every mesh, material, animation, and
asset decision. The model must never provide model files, URLs, shaders, or executable
3D content. Older cached assignments render the theme default when this field is absent.
The current catalog includes school-safe scenes for sports, science, food, music,
gaming, art, outdoors, animals, fitness, and reading; the exact allowlist lives in the
sandbox JSON schema and frontend validator.

### POST `/sandbox-sessions/{session_id}/hint`

Student owner only.

Request:

```json
{
  "question": "Why does force increase?",
  "current_step_id": "step-2"
}
```

Response:

```json
{
  "hint_level": 1,
  "hint": "Focus on which quantity is changing while mass stays constant.",
  "remaining_hint_levels": 2
}
```

Rules:

- Progressive levels
- No immediate final answer
- Limit repeated requests
- Persist `hints_used`
- Moderate unsafe content where appropriate

### POST `/sandbox-sessions/{session_id}/explanation`

Optional MVP endpoint. If implemented, it explains a concept without solving the final activity.

### POST `/sandbox-sessions/{session_id}/chat/stream`

Optional SSE endpoint for streamed tutor output.

Suggested events:

```text
event: response.created
data: {"request_id":"..."}

event: response.delta
data: {"text":"..."}

event: response.completed
data: {"hint_level":1}

event: response.error
data: {"code":"AI_PROVIDER_ERROR","message":"..."}
```

The non-streaming hint endpoint is the required fallback.

Hints should be progressive and state-aware. The backend may use the current step,
session responses, completed steps, and hint level to return a different safe hint
for each request. Hints must not reveal the final answer immediately.

## 10. Submission

### POST `/sandbox-sessions/{session_id}/submit`

Student owner only.

Request:

```json
{
  "expected_session_version": 5,
  "reflection_answers": [
    {
      "question_id": "reflection-1",
      "answer": "Force increased because acceleration increased while mass stayed constant."
    }
  ]
}
```

Response `201`:

```json
{
  "id": "16441ed5-c999-45e3-ac68-1ed530391a19",
  "assignment_id": "3f4d68af-9002-40a2-8e66-f2e5053b18b3",
  "student_id": "f230f06d-a9b0-4e3c-b191-bf8c14ae6907",
  "status": "submitted",
  "submitted_at": "2026-07-15T21:10:00Z"
}
```

Behavior:

- Idempotent for the same session.
- Marks the session submitted.
- Does not grade.
- A second call returns the existing submission or a documented `409`.

### GET `/assignments/{assignment_id}/submissions`

Teacher owner only.

Response:

```json
{
  "items": [
    {
      "submission_id": "16441ed5-c999-45e3-ac68-1ed530391a19",
      "student_id": "f230f06d-a9b0-4e3c-b191-bf8c14ae6907",
      "student_name": "Student One",
      "status": "submitted",
      "submitted_at": "2026-07-15T21:10:00Z"
    }
  ],
  "total": 1
}
```

Do not expose private AI chat transcripts.

### GET `/assignments/{assignment_id}/progress`

Teacher owner only. Returns every enrolled student for the assignment's class.
This is completion visibility, not grading; it never exposes reflection answers or
private tutor conversations.

Response `200`:

```json
{
  "items": [
    {
      "student_id": "f230f06d-a9b0-4e3c-b191-bf8c14ae6907",
      "student_name": "Student One",
      "status": "in_progress",
      "completed_steps": 2,
      "total_steps": 3,
      "hints_used": 1,
      "submitted_at": null
    }
  ],
  "total": 1
}
```

`status` is one of `not_started`, `in_progress`, or `submitted`.

### Sandbox completion checks

`parameter_explorer` guided steps may include explicit machine-readable
`completion_checks`. Supported checks are `value_changed`, `value_increased`,
`value_decreased`, and `reflection_answered`. The renderer evaluates these checks
deterministically and automatically includes satisfied step IDs in progress updates.
The backend validates reflection question IDs and re-evaluates value and reflection
checks when saving progress. Natural-language instructions must not be parsed to infer
completion.

`completion_rules` declare when the UI may enable submission: `all_steps_completed`
requires every guided step; `step_completed` requires its `step_id`; and
`reflection_answered` requires non-empty answers for every reflection question in the
sandbox specification. The backend enforces these same semantics before creating a
submission; clients cannot bypass the completion requirements.

## 11. Health endpoints

### GET `/health`

Basic process health.

```json
{
  "status": "ok"
}
```

### GET `/ready`

Optional readiness check for database connectivity. Do not call OpenAI on every readiness probe.

## 12. Contract testing

Required tests:

- OpenAPI generation succeeds.
- Example sandbox fixture validates against JSON schema.
- Frontend-generated types can be refreshed without errors.
- Every protected route rejects missing auth.
- Role and ownership matrix is covered.
- Start endpoint is idempotent.
- Progress uses optimistic concurrency.
- Submission is idempotent.
- AI provider can be replaced by a fake.
