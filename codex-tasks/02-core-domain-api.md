# Task 02 â€” Classes, Memberships, Assignments, and Interests

Read `AGENTS.md`, all relevant docs, and inspect the completed Task 01 implementation.

## Goal

Implement the core non-AI domain APIs with complete authentication, authorization, validation, and tests.

## Endpoints

### Classes

- `POST /api/v1/classes`
- `GET /api/v1/classes`
- `GET /api/v1/classes/{class_id}`
- `DELETE /api/v1/classes/{class_id}`
- `POST /api/v1/classes/join`
- `GET /api/v1/classes/{class_id}/members`

### Assignments

- `POST /api/v1/classes/{class_id}/assignments`
- `GET /api/v1/classes/{class_id}/assignments`
- `GET /api/v1/assignments/{assignment_id}`
- `PATCH /api/v1/assignments/{assignment_id}`
- `POST /api/v1/assignments/{assignment_id}/publish`

### Interests

- `GET /api/v1/me/interests`
- `PUT /api/v1/me/interests`

## Required behavior

- Teacher can access only owned classes.
- Student sees only joined classes.
- Student sees only published assignments.
- Teacher can see drafts in owned classes.
- Join operation is idempotent.
- Join code is generated server-side and collision-safe.
- Interest updates normalize, deduplicate, enforce limits, and increment version.
- Teacher cannot use student endpoints.
- Student cannot create or modify assignments.
- A non-member cannot see class assignments.
- Choose and implement the documented safe policy for editing/deleting published assignments.
- Return the standard error format.
- Add OpenAPI examples.

## Tests

Cover:

- Full role/ownership matrix
- Join-code failure
- Duplicate join
- Teacher reading another teacher's class
- Student reading an unjoined class
- Draft visibility
- Publish idempotency
- Interest normalization/versioning
- Unsupported sandbox type
- Delete/archive behavior
- Transaction rollback for failed operations

## Out of scope

- OpenAI calls
- Generated assignments
- Sessions
- Hints
- Submission
- Frontend changes

## Acceptance criteria

- All endpoints match `docs/api-contracts.md`.
- Tests and lint pass.
- OpenAPI examples are correct.
- No contract-breaking change is made without updating docs and reporting it.
- Stop after Task 02.
