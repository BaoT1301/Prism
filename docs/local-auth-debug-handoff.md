# Prism Local Authentication Debug Handoff

## Purpose

Use this document to investigate a teammate's local login failure without sharing
or printing any credentials. The observed backend response is:

```json
{
  "error": {
    "code": "AUTH_NOT_CONFIGURED",
    "message": "Authentication verification is not configured."
  }
}
```

The goal is to identify why the process answering the request cannot see its Clerk
configuration. Do not change Supabase, Clerk, or application code until the
runtime evidence below has been collected.

## Current project state

- Main branch local-development documentation/configuration commit: `cc9b270`
  (`docs: clarify authenticated local development`).
- 3D sandbox branch used by the teammate:
  `codex/varun-sandbox-3d`.
- Sandbox branch local-auth fix: `c733bed`
  (`fix: configure authenticated local sandbox development`).
- The teammate must be on `c733bed` or a descendant.
- The actual product authentication provider is **Clerk**. Supabase is used as
  PostgreSQL storage through `DATABASE_URL`; the active backend does not verify
  Supabase Auth tokens.
- A stale line in `AGENTS.md` references Supabase JWTs, but current application
  code, `.env.example`, `README.md`, `docs/architecture-plan.md`, and
  `docs/staging-runbook.md` use Clerk.

## Relevant implementation

### Token verification

`backend/app/services/jwt.py` creates a Clerk JWK client only when
`CLERK_JWKS_URL` is present. It returns `AUTH_NOT_CONFIGURED` when either the JWK
client or `CLERK_ISSUER` is missing.

This happens **before** the authenticated profile/database lookup. Therefore an
`AUTH_NOT_CONFIGURED` response is not caused by a database migration, a Supabase
connection string, a student profile, or a malformed bearer token.

### Local Docker configuration

On `c733bed`, `docker-compose.yml` defines:

- `api.env_file: .env`, so the ignored root `.env` provides Clerk/OpenAI values to
  the container.
- An explicit local Docker `DATABASE_URL` using host `db`.
- `FRONTEND_URL=http://localhost:5173` and `ENVIRONMENT=development`.

The Docker image deliberately does not contain a `.env` file. The file must be
next to `docker-compose.yml` before `docker compose up` is run.

### Local frontend configuration

`vite.config.ts` uses port `5173` with `strictPort: true`. The app will fail to
start if another process owns that port instead of silently moving to `5174`.

For a fully local API, the frontend must use:

```text
VITE_API_BASE_URL=http://localhost:8000
```

## Required local `.env` shape

The teammate's ignored `.env` must be in the repository root and include values
from the same Clerk development instance as the frontend publishable key:

```text
ENVIRONMENT=development
CLERK_JWKS_URL=https://YOUR_CLERK_INSTANCE.clerk.accounts.dev/.well-known/jwks.json
CLERK_ISSUER=https://YOUR_CLERK_INSTANCE.clerk.accounts.dev
CLERK_AUTHORIZED_PARTIES=http://localhost:5173
CLERK_SECRET_KEY=sk_test_...
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_BASE_URL=http://localhost:8000
```

The important distinction is:

- `CLERK_JWKS_URL` ends with `/.well-known/jwks.json`.
- `CLERK_ISSUER` is the base Clerk domain, without that suffix.
- `VITE_CLERK_PUBLISHABLE_KEY`, issuer, and JWK endpoint must all belong to one
  Clerk instance.
- Never commit, paste, or log real secret keys, database passwords, bearer tokens,
  or the complete `.env` file.

For local Docker Postgres, the Compose file provides the database URL. A teammate
does not need a hosted Supabase database URL to solve this auth error. Set
`DEMO_MODE=true` locally when live OpenAI behavior is not being tested, so an
OpenAI key is unnecessary.

## Choose one runtime mode

Do not mix these modes while diagnosing.

### Mode A: local Postgres in Docker, API with local Uvicorn (recommended)

```powershell
docker compose up -d db
.\.venv\Scripts\alembic -c backend/alembic.ini upgrade head
.\.venv\Scripts\uvicorn app.main:app --app-dir backend --reload
```

Then use `npm run dev` in a second terminal.

### Mode B: local Postgres and API in Docker

Requires `c733bed` or later and a root `.env` before startup:

```powershell
docker compose down --remove-orphans
docker compose up -d --build db api
```

Apply migrations from the host before using the API:

```powershell
.\.venv\Scripts\alembic -c backend/alembic.ini upgrade head
```

### Mode C: local frontend against Railway

This is not a fully local backend. Use the Railway URL in `VITE_API_BASE_URL`.
The Railway environment must allow the local browser origin in its comma-separated
`CLERK_AUTHORIZED_PARTIES`, for example:

```text
https://DEPLOYED_FRONTEND,http://localhost:5173
```

The frontend must be restarted and the user must sign out/in after changing it.

## Evidence collection: run in this order

Run from the teammate's repository root. Do not send secrets in the output.

### 1. Confirm source and local file placement

```powershell
git status --short --branch
git log -1 --oneline
Test-Path .env
```

Expected:

- current branch: `codex/varun-sandbox-3d`
- commit: `c733bed` or later
- `Test-Path .env`: `True`

### 2. Confirm which process owns the backend port

```powershell
docker compose ps
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

If testing Docker mode, the `api` container must be running. If testing Uvicorn
mode, do not leave an old Docker `api` container or another stale process on port
8000.

### 3. Prove whether the running backend received Clerk configuration

For Docker API mode:

```powershell
docker compose exec api python -c "from app.core.config import Settings; s=Settings(); print({'issuer_loaded': bool(s.clerk_issuer), 'jwks_loaded': bool(s.clerk_jwks_url), 'secret_loaded': bool(s.clerk_secret_key), 'authorized_parties': s.clerk_authorized_parties})"
```

For local Uvicorn mode, run the same check on the host from repository root:

```powershell
.\.venv\Scripts\python -c "from app.core.config import Settings; s=Settings(); print({'issuer_loaded': bool(s.clerk_issuer), 'jwks_loaded': bool(s.clerk_jwks_url), 'secret_loaded': bool(s.clerk_secret_key), 'authorized_parties': s.clerk_authorized_parties})"
```

Expected:

```text
issuer_loaded: True
jwks_loaded: True
secret_loaded: True
authorized_parties: http://localhost:5173
```

If `issuer_loaded` or `jwks_loaded` is `False`, stop here. The root cause is
environment loading, not Supabase or the user's session. Check root location,
filename `.env`, checked-out commit, then rebuild/restart the chosen API process.

### 4. Isolate database readiness separately

```powershell
Invoke-WebRequest http://localhost:8000/health -UseBasicParsing
Invoke-WebRequest http://localhost:8000/ready -UseBasicParsing
```

- `/health` tests that FastAPI is running.
- `/ready` tests that the configured database can execute `SELECT 1`.

Only investigate database DNS, pooler strings, migrations, or Supabase after
`/ready` fails. A previous manual lookup used an incorrect Supabase project
reference; use the full Session Pooler connection string from Supabase rather than
constructing a `db.<project-ref>.supabase.co` hostname.

### 5. Collect targeted logs if configuration is present

```powershell
docker compose logs api --tail 100
```

For host Uvicorn mode, capture only the request/error lines from its terminal.
Never include `Authorization` headers, JWTs, API keys, database URLs, or complete
environment output.

## Questions for the auditing AI

1. Based on the boolean configuration check, which exact process is responding to
   the browser request, and did it receive Clerk issuer/JWK values?
2. Is the frontend actually calling `http://localhost:8000`, Railway, or an old
   service? Inspect the browser Network request URL if needed.
3. If config values are present, are the issuer, JWK endpoint, and publishable key
   from the same Clerk instance?
4. Does `/ready` succeed independently of login?
5. If all above pass, inspect the redacted API response and backend logs for the
   request ID. Do not infer a Supabase problem from an auth configuration error.

## Security follow-up

Database credentials and a Supabase service-role key were previously exposed in
screenshots/chat. Rotate exposed credentials, update deployment secrets, and avoid
sharing a full production `.env` with teammates. Prefer local Docker Postgres and
`DEMO_MODE=true` for development unless a specific hosted integration is being
tested.
