# Task 04 â€” Sandbox Sessions, Progressive Hints, and Submission

Read all repository instructions and contracts before implementation.

## Goal

Complete the student backend flow after assignment generation.

## Endpoints

- `GET /api/v1/sandbox-sessions/{session_id}`
- `PATCH /api/v1/sandbox-sessions/{session_id}/progress`
- `POST /api/v1/sandbox-sessions/{session_id}/hint`
- Optional `POST /api/v1/sandbox-sessions/{session_id}/explanation`
- Optional `POST /api/v1/sandbox-sessions/{session_id}/chat/stream`
- `POST /api/v1/sandbox-sessions/{session_id}/submit`
- `GET /api/v1/assignments/{assignment_id}/submissions`

## Required behavior

### Session

- Only owning student can read/update.
- Progress update uses expected version.
- Stale version returns conflict.
- Validate completed step IDs against sandbox spec.
- Validate response keys and numeric ranges.
- Increment session version atomically.
- Reset is not required unless already in the frontend contract.

### Progressive hints

- Hint levels increase progressively.
- Never immediately reveal the final answer.
- Persist hints used.
- Rate limit or cap requests per session.
- Use fixture provider in tests.
- Teacher cannot call student hint endpoint.

### Submission

- Verify ownership.
- Verify session is eligible.
- Snapshot responses and reflections.
- Insert submission and mark session submitted in one transaction.
- Make repeated submission idempotent.
- Do not grade.
- Teacher completion list exposes only required summary fields.

### Optional streaming

Implement only if non-streaming hint flow is already stable. Use SSE with documented event types and disconnect handling.

## Tests

- Session ownership
- Progress success
- Version conflict
- Invalid step ID
- Invalid variable/range
- Progressive hint levels
- Hint cap
- Provider failure
- Transactional submission
- Repeated submission
- Teacher completion visibility
- Cross-teacher denial
- Cross-student denial

## Acceptance criteria

- Student can resume, update progress, request hint, and submit.
- Teacher can see completion status.
- Tests and lint pass.
- No grading or unrelated features are added.
- Stop after Task 04.
