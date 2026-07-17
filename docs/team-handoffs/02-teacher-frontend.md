# Person 2 - Teacher Frontend

Read docs/team-handoffs/README.md and docs/api-contracts.md. Use Person 6's shared
authenticated API client; do not implement separate Clerk token handling.

## Own

- Teacher login/onboarding screens, dashboard, classes, assignments, publishing,
  members, and submission summary screens.

## APIs

- POST /api/v1/profiles/bootstrap and GET /api/v1/me
- POST and GET /api/v1/classes
- GET and DELETE /api/v1/classes/{class_id}
- GET /api/v1/classes/{class_id}/members
- POST and GET /api/v1/classes/{class_id}/assignments
- GET and PATCH /api/v1/assignments/{assignment_id}
- POST /api/v1/assignments/{assignment_id}/publish
- GET /api/v1/assignments/{assignment_id}/submissions

## Required behavior

- Attach the Clerk session token on every request.
- Show standardized backend errors and request ID where useful for support.
- Treat a published assignment as read-only; backend returns 409 for content edits.
- Include loading, no-class/no-member/no-submission, and authorization states.
- Use mocks first if staging is unavailable, but match the docs exactly.

## Acceptance flow

Teacher logs in, bootstraps teacher profile, creates class, copies join code, creates
assignment, publishes, and sees members/submission status.
