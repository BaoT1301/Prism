# Prism

Personalized learning platform: FastAPI backend and React/Vite sandbox frontend.

## Local development

Requirements: Python 3.12, Node.js 20+, and Docker only when using the bundled local
PostgreSQL database. A hosted Supabase database does not require Docker for normal
development.

### Configure local authentication

Copy the template, then set the Clerk values from the **same Clerk development
instance** in the ignored root `.env` file:

```powershell
Copy-Item .env.example .env
```

```text
CLERK_ISSUER=https://YOUR_INSTANCE.clerk.accounts.dev
CLERK_JWKS_URL=https://YOUR_INSTANCE.clerk.accounts.dev/.well-known/jwks.json
CLERK_AUTHORIZED_PARTIES=http://localhost:5173
CLERK_SECRET_KEY=sk_test_...
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_BASE_URL=http://localhost:8000
```

In Clerk, add `http://localhost:5173` as an allowed origin and redirect URL.
`npm run dev` is intentionally pinned to port 5173; if that port is busy, stop
the other process instead of accepting a different port and an invalid token.

Never copy Railway, Supabase, OpenAI, or Clerk secret values into Git, a PR, or a
frontend `VITE_*` variable. `DATABASE_URL` is the only Supabase value the current
backend needs: use either the bundled Docker database below or a full Supabase
Postgres connection string.

### Run the local API and database

This is the recommended authenticated-development path. Docker runs only the local
Postgres database; Uvicorn reads the Clerk settings from the root `.env` file.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -e ".\backend[dev]"
docker compose up -d db
.\.venv\Scripts\alembic -c backend/alembic.ini upgrade head
.\.venv\Scripts\uvicorn app.main:app --app-dir backend --reload
```

In a second terminal:

```powershell
npm ci
npm run dev
```

Open `http://localhost:5173`. After changing a `VITE_*` value, restart the Vite
server. After changing a backend setting, restart Uvicorn or the API container.

### Run the API in Docker (optional)

`docker compose up -d api` now reads Clerk settings from the ignored root `.env`
file. It still uses the Docker Postgres database. Apply migrations from the host
first using the command above, then start the API container:

```powershell
docker compose up -d db
.\.venv\Scripts\alembic -c backend/alembic.ini upgrade head
docker compose up -d --build api
```

### Test a local frontend against Railway (optional)

Only use this when deliberately testing the deployed backend. Set:

```text
VITE_API_BASE_URL=https://YOUR_RAILWAY_DOMAIN
```

Then add the exact local origin used by Vite, such as `http://localhost:5173`, to
both Clerk's allowed origins/redirect URLs and Railway's comma-separated
`CLERK_AUTHORIZED_PARTIES`. Redeploy Railway, restart Vite, and sign out then back
in. A Railway allow-list containing only the Vercel domain will reject a local
Clerk token.

## Backend health

Open `http://localhost:8000/docs` or call `GET /health` after starting the local
API.

## Frontend application

The standalone sandbox demo remains fixture-backed, but the main application uses
the shared Clerk client and launches the sandbox against the authenticated API.

Run checks:

```powershell
.\.venv\Scripts\ruff check backend
.\.venv\Scripts\pytest backend/tests
npm test
npm run build
```

See `backend/README.md` for migration and Clerk auth details.
See `docs/staging-runbook.md` before deploying or running the live demo flow.
