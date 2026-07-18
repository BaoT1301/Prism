# Team Handoffs

Give every teammate's AI this file, then their role file in this folder, before it
changes code. Read AGENTS.md, docs/, contracts/, and the relevant role handoff first.

## Current baseline

The backend is a Python 3.12 FastAPI monolith under backend/. It has Alembic
migrations, Clerk JWKS verification structure, core class/assignment/interest APIs,
fixture/OpenAI assignment personalization, sessions, hints, submissions, Docker, CI,
and demo seeds. This work is committed on `main`.

The frontend is a React 19/Vite application. It includes a tested parameter-explorer
sandbox renderer, JSON-schema validation, deterministic formula registry, completion
checks, and a fixture-backed standalone browser demo. The main application also has a
shared Clerk authentication shell, authenticated teacher and student flows, and a
student host that launches the renderer through `createSandboxApi`.

Verified locally: Ruff, 23 pytest tests, 9 Vitest tests, a production Vite build,
and browser rendering of the authentication shell. The configured hosted Supabase
database has migration `a27c8a345abc` applied. A real authenticated teacher/student
flow, live OpenAI generation, and the deployed browser flow remain staging checks.

## Shared contracts

- Base API path: /api/v1
- Auth: Authorization: Bearer Clerk session token
- Standard errors include code, message, and request_id.
- Sandbox contract: contracts/sandbox-spec.schema.json
- Initial sandbox: parameter_explorer
- Initial formula: force_equals_mass_times_acceleration
- Published assignments are intentionally read-only.
- The AI may not return code, HTML, scripts, arbitrary formulas, or external URLs.

## Integration rules

1. Person 1 alone owns models, migrations, backend authorization, and backend deployment.
2. Person 6 owns one shared frontend Clerk/authenticated API client.
3. Persons 2 and 3 consume that client; neither creates a second auth implementation.
4. Person 4 owns the renderer but cannot change the sandbox schema alone.
5. Person 5 works behind PersonalizationProvider; do not alter routes or migrations.
6. The student host page must instantiate `createSandboxApi(resolveApiBaseUrl(), getAccessToken)`;
   local development resolves `VITE_API_BASE_URL`, while Vercel resolves the same-origin
   `/api` proxy. It must not use `createDemoSandboxApi` outside the standalone sandbox demo.
7. Every PR is small, includes tests where applicable, and preserves documented API
   payloads. Coordinate any contract change with affected owners.

## Manual environment work

For a new staging or production environment, the technical lead/integration owner
must complete:

- apply the migration to Supabase Postgres and confirm the current revision;
- create real teacher/student demo accounts;
- test a real Clerk session token against GET /api/v1/me;
- test a protected live OpenAI call;
- set deployment variables, frontend redirect URLs, and production CORS;
- deploy staging and run the full browser flow.

## Integration readiness

The sandbox package is connected to the committed student frontend. The endpoints it
needs already exist, and the app performs Clerk login plus authenticated sandbox
launches. The remaining proof is to configure the deployed URLs, create controlled
demo accounts, and complete the live browser smoke flow.

Never commit .env, database URLs, OpenAI keys, service-role keys, or production data.
