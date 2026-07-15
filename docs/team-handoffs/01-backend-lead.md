# Person 1 - Backend and Architecture Lead

Read docs/team-handoffs/README.md, AGENTS.md, backend docs, and existing tests before
editing code.

## Own

- FastAPI routes/services, SQLAlchemy models, Alembic, API contracts, authorization.
- Supabase backend verification, staging backend, OpenAI provider configuration.
- Reviewing backend PRs, resolving integration issues, and protecting privacy.

## First tasks

1. Commit and push the existing backend work after reviewing the diff.
2. Apply backend/alembic to Supabase Postgres using the configured connection.
3. Test a real Supabase access token against /api/v1/me and profile bootstrap.
4. Deploy a staging FastAPI service, set FRONTEND_URL, and publish Swagger URL.
5. Run a protected live OpenAI smoke test.

## Known implementation details

- profiles.auth_user_id is unique without an auth.users FK until the Supabase migration
  role has been confirmed to support that cross-schema FK.
- The app normalizes postgres:// and postgresql:// URLs to psycopg v3 URLs.
- Assignment start uses FixturePersonalizationProvider only when DEMO_MODE=true;
  otherwise it uses OpenAI.
- Hints are currently deterministic/capped at three; an AI hint provider is future
  enhancement work and needs tests before replacing that safe fallback.

## Do not

Do not let anyone edit an applied migration, redesign contracts without review, or add
queues, Redis, grading, arbitrary code execution, or extra sandbox types.
