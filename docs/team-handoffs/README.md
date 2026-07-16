# Team Handoffs

Give every teammate's AI this file, then their role file in this folder, before it
changes code. Read AGENTS.md, docs/, contracts/, and the relevant role handoff first.

## Current baseline

The backend is a Python 3.12 FastAPI monolith under backend/. It has a static Alembic
migration, Supabase JWKS verification structure, core class/assignment/interest APIs,
fixture/OpenAI assignment personalization, sessions, hints, submissions, Docker, CI,
and demo seeds. This work is committed on `main`.

The frontend is a React 19/Vite application. It includes a tested parameter-explorer
sandbox renderer, JSON-schema validation, deterministic formula registry, completion
checks, and a fixture-backed browser demo. The demo adapter is intentionally local;
the shared authenticated API client must replace it in the student host page.

Verified locally: Ruff, 19 pytest tests, 9 Vitest tests, and a production Vite build.
Real Supabase login, applied hosted-database migration, live OpenAI generation, and
the full deployed browser flow remain staging integration checks, not completed proof.

## Shared contracts

- Base API path: /api/v1
- Auth: Authorization: Bearer Supabase access token
- Standard errors include code, message, and request_id.
- Sandbox contract: contracts/sandbox-spec.schema.json
- Initial sandbox: parameter_explorer
- Initial formula: force_equals_mass_times_acceleration
- Published assignments are intentionally read-only.
- The AI may not return code, HTML, scripts, arbitrary formulas, or external URLs.

## Integration rules

1. Person 1 alone owns models, migrations, backend authorization, and backend deployment.
2. Person 6 owns one shared frontend Supabase/authenticated API client.
3. Persons 2 and 3 consume that client; neither creates a second auth implementation.
4. Person 4 owns the renderer but cannot change the sandbox schema alone.
5. Person 5 works behind PersonalizationProvider; do not alter routes or migrations.
6. The student host page must instantiate `createSandboxApi(VITE_API_BASE_URL, getAccessToken)`;
   it must not use `createDemoSandboxApi` outside the standalone sandbox demo.
7. Every PR is small, includes tests where applicable, and preserves documented API
   payloads. Coordinate any contract change with affected owners.

## Manual environment work

The technical lead/integration owner must still complete:

- apply the migration to Supabase Postgres;
- create real teacher/student demo accounts;
- test real Supabase login token against GET /api/v1/me;
- test a protected live OpenAI call;
- set deployment variables, frontend redirect URLs, and production CORS;
- deploy staging and run the full browser flow.

## Integration readiness

The sandbox package is ready for the student frontend to consume. The endpoints it
needs already exist, but no committed screen currently performs real Supabase login or
launches the renderer against the deployed API. Person 6 must first provide the shared
authenticated client; Persons 2 and 3 can then integrate their screens in parallel.

Never commit .env, database URLs, OpenAI keys, service-role keys, or production data.
