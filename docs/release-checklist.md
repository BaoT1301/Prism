# Release Checklist

Run this against the staging deployment after applying the staging runbook.

## Authentication and authorization

- Teacher and student can sign up, confirm email if enabled, sign in, refresh, and sign out.
- Each role can bootstrap exactly one matching application profile.
- A student cannot open teacher pages or teacher-owned class/assignment resources.
- A teacher cannot access another teacher's classes, assignments, or submissions.

## Golden product flow

1. Teacher creates Physics 101, copies the join code, creates a Newton's Second Law assignment, and publishes it.
2. Basketball, Formula 1, and space students join with the code and save their interests.
3. Each student starts the assignment and receives/resumes a valid personalized sandbox.
4. A student changes variables, saves progress, reloads, receives the same session state, requests progressive hints, completes the reflection, and submits.
5. Teacher sees the submitted student's completion status.

## Failure and safety checks

- Missing/expired/invalid Clerk session tokens return 401; wrong roles return 403/hidden 404.
- An unpublished or non-member assignment cannot be started.
- A stale progress version returns `SESSION_VERSION_CONFLICT` without overwriting newer state.
- Incomplete completion rules return `SANDBOX_INCOMPLETE` on submit.
- Invalid AI structured output/objective drift is rejected; failed generations can be retried safely.
- No browser bundle or request log contains an OpenAI key, database URL, Clerk secret key, or Supabase service-role key.

## Deployment proof

- `/health`, `/ready`, and `/docs` work on the backend host.
- Frontend origin is the only configured production CORS origin.
- Alembic current revision is `a27c8a345abc`.
- GitHub Actions backend and frontend jobs pass on the release commit.
