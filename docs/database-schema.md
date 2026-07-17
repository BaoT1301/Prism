# Database Schema

## 1. Database principles

- PostgreSQL is the source of truth.
- Clerk owns credentials and auth sessions.
- Application tables store product data and roles.
- Use UUID primary keys.
- Use timezone-aware timestamps with server defaults.
- Use explicit foreign keys, uniqueness constraints, and indexes.
- Use JSONB only where the shape is intentionally flexible or versioned.
- Use Alembic for all schema changes.
- Prefer database constraints over application-only assumptions.

## 2. Auth relationship

Clerk stores authenticated identities outside this database.

Application table:

```text
profiles.auth_user_id -> Clerk user ID
```

The application stores Clerk's immutable string user ID as a unique external identity
reference. There is intentionally no cross-service foreign key; verified Clerk JWTs
are the application trust boundary.

## 3. Enums

Recommended PostgreSQL enums or validated text columns:

```text
user_role:
- teacher
- student

assignment_status:
- draft
- published
- archived

generation_status:
- pending
- completed
- failed

sandbox_session_status:
- in_progress
- completed
- submitted
```

Using text plus check constraints can simplify migrations. Pick one consistent approach.

## 4. Tables

### `profiles`

Purpose: application identity and role.

```text
id              UUID PK
auth_user_id    VARCHAR(128) NOT NULL UNIQUE
email           CITEXT or VARCHAR NOT NULL
display_name    VARCHAR(120) NOT NULL
role            user_role NOT NULL
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

Indexes:

- unique `auth_user_id`
- optional index on `role`
- optional unique normalized email only if product requirements require it; Clerk controls identity-email uniqueness

Rules:

- Role is immutable through normal profile update APIs.
- Email comes from a verified Clerk token claim or trusted Clerk Backend API lookup.

### `classes`

```text
id              UUID PK
teacher_id      UUID NOT NULL FK profiles.id
name            VARCHAR(160) NOT NULL
subject         VARCHAR(100) NOT NULL
grade_level     VARCHAR(40) NOT NULL
description     TEXT NULL
join_code       VARCHAR(12) NOT NULL UNIQUE
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

Indexes:

- `teacher_id`
- unique `join_code`
- optional `(teacher_id, created_at DESC)`

Rules:

- `teacher_id` must reference a teacher profile; enforce in service logic.
- Join codes should use a collision-resistant generator and retry on uniqueness conflict.

### `class_members`

```text
id              UUID PK
class_id        UUID NOT NULL FK classes.id
student_id      UUID NOT NULL FK profiles.id
joined_at       TIMESTAMPTZ NOT NULL DEFAULT now()
```

Constraints:

```text
UNIQUE(class_id, student_id)
```

Indexes:

- `student_id`
- `(class_id, joined_at)`

Rules:

- `student_id` must reference a student profile.
- Join operation is idempotent.

### `assignments`

```text
id                  UUID PK
class_id            UUID NOT NULL FK classes.id
teacher_id          UUID NOT NULL FK profiles.id
title               VARCHAR(200) NOT NULL
topic               VARCHAR(200) NOT NULL
learning_objective  TEXT NOT NULL
grade_level         VARCHAR(40) NOT NULL
instructions        TEXT NULL
sandbox_type        VARCHAR(50) NOT NULL
status              assignment_status NOT NULL DEFAULT 'draft'
content_version     INTEGER NOT NULL DEFAULT 1
published_at        TIMESTAMPTZ NULL
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

Constraints:

- `content_version >= 1`
- `sandbox_type` must match an approved renderer
- Published status should have `published_at`

Indexes:

- `class_id`
- `teacher_id`
- `(class_id, status)`
- `(class_id, created_at DESC)`

The duplicated `teacher_id` makes ownership checks fast but must match the owning class teacher. A service-level invariant or trigger must preserve this relationship. An alternative is to omit it and derive ownership through `classes`; choose one approach consistently. Recommended MVP: retain it for straightforward authorization and validate in the service.

### `interest_profiles`

```text
id                  UUID PK
student_id          UUID NOT NULL UNIQUE FK profiles.id
version             INTEGER NOT NULL DEFAULT 1
sports              JSONB NOT NULL DEFAULT '[]'
games               JSONB NOT NULL DEFAULT '[]'
movies              JSONB NOT NULL DEFAULT '[]'
hobbies             JSONB NOT NULL DEFAULT '[]'
career_interests    JSONB NOT NULL DEFAULT '[]'
favorite_animals    JSONB NOT NULL DEFAULT '[]'
favorite_subjects   JSONB NOT NULL DEFAULT '[]'
additional_interests JSONB NOT NULL DEFAULT '[]'
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

Constraints:

- `version >= 1`
- one current profile per student

On every meaningful update, increment `version`.

A single `interests JSONB` column would be simpler, but separate JSONB arrays provide clearer API mapping while remaining flexible.

### `generated_assignments`

```text
id                        UUID PK
assignment_id             UUID NOT NULL FK assignments.id
assignment_content_version INTEGER NOT NULL
student_id                UUID NOT NULL FK profiles.id
interest_profile_version  INTEGER NOT NULL
status                    generation_status NOT NULL
personalized_title        VARCHAR(240) NULL
scenario                  TEXT NULL
problem_statement         TEXT NULL
learning_objective        TEXT NULL
instructions              JSONB NULL
reflection_questions      JSONB NULL
sandbox_spec              JSONB NULL
model                     VARCHAR(100) NULL
prompt_version            VARCHAR(50) NULL
provider_response_id      VARCHAR(200) NULL
generation_latency_ms     INTEGER NULL
failure_code              VARCHAR(100) NULL
failure_message           TEXT NULL
created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
completed_at              TIMESTAMPTZ NULL
```

Critical uniqueness:

```text
UNIQUE(
  assignment_id,
  assignment_content_version,
  student_id,
  interest_profile_version
)
```

Indexes:

- `student_id`
- `assignment_id`
- `(student_id, created_at DESC)`
- optional partial index for `status = 'pending'`

Rules:

- Persist only validated `sandbox_spec`.
- `learning_objective` must equal the source assignment objective after normalization or an approved invariant comparison.
- Failure messages must not expose secrets or complete raw provider output.
- A pending row can act as a generation lock if implemented with transactions.

### `sandbox_sessions`

```text
id                       UUID PK
generated_assignment_id  UUID NOT NULL FK generated_assignments.id
student_id               UUID NOT NULL FK profiles.id
status                   sandbox_session_status NOT NULL DEFAULT 'in_progress'
version                  INTEGER NOT NULL DEFAULT 1
progress                 JSONB NOT NULL DEFAULT '{}'
responses                JSONB NOT NULL DEFAULT '{}'
completed_step_ids       JSONB NOT NULL DEFAULT '[]'
attempt_count            INTEGER NOT NULL DEFAULT 0
hints_used               INTEGER NOT NULL DEFAULT 0
started_at               TIMESTAMPTZ NOT NULL DEFAULT now()
completed_at             TIMESTAMPTZ NULL
submitted_at             TIMESTAMPTZ NULL
updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
```

Constraints:

- `version >= 1`
- `attempt_count >= 0`
- `hints_used >= 0`
- Optional unique active session per generated assignment and student

Recommended MVP uniqueness:

```text
UNIQUE(generated_assignment_id, student_id)
```

This makes start/resume behavior simple.

Indexes:

- `student_id`
- `generated_assignment_id`
- `(student_id, updated_at DESC)`

Use optimistic concurrency by updating where `version = expected_version`, then incrementing version.
`progress` stores the latest completed step IDs, variable responses, and typed
reflection answers so a student can safely resume an unfinished sandbox. The dedicated
`responses` and `completed_step_ids` columns remain the queryable copies of the first
two values; the submission persists the final reflection-answer snapshot separately.

### `submissions`

```text
id                       UUID PK
assignment_id            UUID NOT NULL FK assignments.id
generated_assignment_id  UUID NOT NULL FK generated_assignments.id
session_id               UUID NOT NULL UNIQUE FK sandbox_sessions.id
student_id               UUID NOT NULL FK profiles.id
responses_snapshot       JSONB NOT NULL
reflection_answers       JSONB NOT NULL DEFAULT '[]'
submitted_at             TIMESTAMPTZ NOT NULL DEFAULT now()
```

Constraints:

```text
UNIQUE(assignment_id, student_id)
UNIQUE(session_id)
```

If future resubmissions are desired, replace the first uniqueness rule with a submission attempt/version. The MVP should allow one final submission per assignment/student.

Indexes:

- `assignment_id`
- `student_id`
- `(assignment_id, submitted_at DESC)`

### `ai_generation_events` â€” optional

Add only if time permits or useful for demo metrics.

```text
id                  UUID PK
operation_type      VARCHAR(50) NOT NULL
assignment_id       UUID NULL
student_id          UUID NULL
model               VARCHAR(100) NULL
prompt_version      VARCHAR(50) NULL
cache_status        VARCHAR(20) NULL
latency_ms          INTEGER NULL
success             BOOLEAN NOT NULL
error_code          VARCHAR(100) NULL
request_id          VARCHAR(100) NULL
created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
```

Do not store raw access tokens, full secrets, or unnecessary chat content.

## 5. Delete behavior

Recommended MVP:

- `profiles`: restrict delete
- `classes`: restrict once assignments/submissions exist, or explicitly cascade only in local/demo data
- `class_members`: cascade when class is deleted
- `assignments`: restrict when generated assignments or submissions exist
- `generated_assignments`: restrict when sessions/submissions exist
- `sandbox_sessions`: restrict when submission exists
- `submissions`: restrict

Avoid accidental cascading deletion of demo submissions.

If the product requires a delete button, prefer an `archived` status for classes/assignments rather than hard deletion.

## 6. Transactions

Use transactions for:

### Join class

- Resolve join code
- Check student role
- Insert membership with conflict-safe behavior

### Publish assignment

- Verify teacher ownership
- Validate supported sandbox type
- Update status and timestamp

### Start assignment

- Verify access
- Resolve profile versions
- Look up or reserve generation row
- Avoid duplicate provider calls as much as practical
- Persist completed generation
- Create/resume session

Do not hold a database transaction open during a long OpenAI request if it creates lock contention. A common pattern is:

1. Insert a unique `pending` generation row.
2. Commit.
3. Call provider.
4. Update row to completed or failed.
5. Competing requests poll briefly or return the completed row.

For the hackathon, a simpler unique insert plus controlled conflict handling is acceptable.

### Submit

- Verify session ownership and version
- Insert submission idempotently
- Mark session submitted
- Commit atomically

## 7. Migration order

Initial migration:

1. Extensions if permitted, such as `citext`
2. Enums/check constraints
3. `profiles`
4. `classes`
5. `class_members`
6. `assignments`
7. `interest_profiles`
8. `generated_assignments`
9. `sandbox_sessions`
10. `submissions`
11. Indexes
12. Optional `ai_generation_events`

Subsequent migrations must be additive and reviewed. Do not rewrite an applied migration after teammates have used it.

## 8. Seed data

Create an idempotent seed command for local/demo environments:

- One teacher
- Three students
- One Physics class
- Three memberships
- Three interest profiles:
  - Basketball
  - Formula 1
  - Space
- One published Newton's Second Law assignment
- Optional pre-generated personalized assignment fixtures

Do not seed production credentials. Auth users must be created through Clerk.

## 9. Database tests

Required:

- Unique class join code
- Unique class membership
- One profile per auth user
- One interest profile per student
- Generated assignment cache uniqueness
- One session per generated assignment/student
- One submission per assignment/student
- Foreign-key behavior
- Optimistic session update
- Transactional submission
