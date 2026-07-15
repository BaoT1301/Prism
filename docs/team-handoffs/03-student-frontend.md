# Person 3 - Student Frontend and Onboarding

Read docs/team-handoffs/README.md, docs/api-contracts.md, and Person 4's handoff.
Use Person 6's shared authenticated API client.

## Own

- Student onboarding/profile bootstrap, join-class page, dashboard, interests,
  assignment launch/loading state, sandbox host page, and submission confirmation.

## APIs

- POST /api/v1/profiles/bootstrap and GET /api/v1/me
- POST /api/v1/classes/join and GET /api/v1/classes
- GET and PUT /api/v1/me/interests
- GET /api/v1/classes/{class_id}/assignments
- GET /api/v1/assignments/{assignment_id}
- POST /api/v1/assignments/{assignment_id}/start
- GET /api/v1/sandbox-sessions/{session_id}
- PATCH /api/v1/sandbox-sessions/{session_id}/progress
- POST /api/v1/sandbox-sessions/{session_id}/hint
- POST /api/v1/sandbox-sessions/{session_id}/submit

## Important behavior

- Start may return missing-interest, unpublished, non-member, pending, or provider
  errors; handle each visibly.
- Pass sandbox_spec, session, and session ID to Person 4's renderer.
- Store and update optimistic session.version; on conflict reload rather than overwrite.
- Do not reimplement formula or sandbox logic in the page layer.

## Acceptance flow

Student logs in, joins class, saves interests, sees published assignment, starts it,
opens the renderer, and completes progress/hint/submission.
