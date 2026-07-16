# Person 6 - Auth Integration, DevOps, QA, and Demo

Read docs/team-handoffs/README.md, docs/api-contracts.md, and all role handoffs.

## Own

- Shared frontend Supabase authentication and authenticated API client.
- Staging/deployment integration, CORS, demo accounts, browser smoke tests, and demo
  rehearsal.

## First tasks

1. Add the official browser Supabase client and create one shared client under a
   frontend location such as frontend/lib/api/.
2. Read the Supabase session access token and set the Authorization Bearer header.
3. Handle missing token, 401, 403, and standard backend error bodies consistently.
4. Configure Supabase Site URL/redirect URLs and deployed backend FRONTEND_URL.
5. Deploy frontend/backend staging and validate health/docs.

## End-to-end acceptance

Teacher login, class, assignment, publish; student login, join, interests, start,
sandbox progress, hint, submit; teacher sees completion.

Create demo accounts early: teacher, basketball student, Formula 1 student, and space
student. Use DEMO_MODE=true only as an explicit rehearsal fallback.
