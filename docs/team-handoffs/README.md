# Team Handoffs

Give every teammate's AI this file, then their role file in this folder, before it
changes code. Read AGENTS.md, docs/, contracts/, and the relevant role handoff first.

## Current baseline

The backend is a Python 3.12 FastAPI monolith under backend/. It has a static Alembic
migration, Supabase JWKS verification structure, core class/assignment/interest APIs,
fixture/OpenAI assignment personalization, sessions, hints, submissions, Docker, CI,
and demo seeds. The backend is not yet committed or pushed beyond context-pack commit
813e206; do not assume remote GitHub has the implementation until the technical lead
commits and pushes it.

Verified locally: Ruff, 18 pytest tests, local PostgreSQL migration downgrade and
upgrade, Docker build, OpenAPI import, and idempotent demo seed. Real Supabase login
and live OpenAI generation are still staging integration checks, not completed proof.

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

1. Person 1 alone owns models, migrations, and backend authorization.
2. Person 6 owns one shared frontend Supabase/authenticated API client.
3. Persons 2 and 3 consume that client; neither creates a second auth implementation.
4. Person 4 owns the renderer but cannot change the sandbox schema alone.
5. Person 5 works behind PersonalizationProvider; do not alter routes or migrations.
6. Every PR is small, includes tests where applicable, and preserves documented API
   payloads. Coordinate any contract change with affected owners.

## Manual environment work

The technical lead/integration owner must still complete:

- apply the migration to Supabase Postgres;
- create real teacher/student demo accounts;
- test real Supabase login token against GET /api/v1/me;
- test a protected live OpenAI call;
- set deployment variables, frontend redirect URLs, and production CORS;
- deploy staging and run the full browser flow.

Never commit .env, database URLs, OpenAI keys, service-role keys, or production data.
