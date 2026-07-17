# Person 6 - Auth Integration, DevOps, QA, and Demo

Read docs/team-handoffs/README.md, docs/api-contracts.md, and all role handoffs.

## Own

- Shared frontend Supabase authentication and authenticated API client.
- Staging/deployment integration, CORS, demo accounts, browser smoke tests, and demo
  rehearsal.

## Remaining integration tasks

1. Configure Supabase Site URL/redirect URLs and deployed backend `FRONTEND_URL`.
2. Deploy frontend/backend staging and validate health/docs.
3. Create controlled teacher/student demo accounts and confirm email if enabled.
4. Run and record the full browser smoke flow below.

## End-to-end acceptance

Teacher login, class, assignment, publish; student login, join, interests, start,
sandbox progress, hint, submit; teacher sees completion.

Create demo accounts early: teacher, basketball student, Formula 1 student, and space
student. Use DEMO_MODE=true only as an explicit rehearsal fallback.
