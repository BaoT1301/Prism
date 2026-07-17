# Person 1 - Backend and Architecture Lead

Read docs/team-handoffs/README.md, AGENTS.md, backend docs, and existing tests before
editing code.

## Own

- FastAPI routes/services, SQLAlchemy models, Alembic, API contracts, authorization.
- Clerk backend verification, staging backend, OpenAI provider configuration.
- Reviewing backend PRs, resolving integration issues, and protecting privacy.

## First tasks

1. Apply backend/alembic to Supabase Postgres using the configured connection.
2. Test a real Clerk session token against /api/v1/me and profile bootstrap.
3. Deploy a staging FastAPI service, set FRONTEND_URL, and publish Swagger URL.
4. Run a protected live OpenAI smoke test.

## Known implementation details

- profiles.auth_user_id stores a unique Clerk user ID without a cross-service foreign
  key; the verified Clerk JWT subject is the application trust boundary.
- The app normalizes postgres:// and postgresql:// URLs to psycopg v3 URLs.
- Assignment start uses FixturePersonalizationProvider only when DEMO_MODE=true;
  otherwise it uses OpenAI.
- Hints are currently deterministic/capped at three; an AI hint provider is future
  enhancement work and needs tests before replacing that safe fallback.

## Do not

Do not let anyone edit an applied migration, redesign contracts without review, or add
queues, Redis, grading, arbitrary code execution, or extra sandbox types.
