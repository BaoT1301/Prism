# Prism

[Repository](https://github.com/BaoT1301/Prism) · AI-powered personalized learning for a classroom demo.

Prism lets a teacher set one learning objective, then gives each student a safe, interest-aware version of the same interactive learning experience. The current vertical slice teaches Newton's Second Law through a schema-driven physics sandbox: students change mass and acceleration, observe deterministic force calculations, request progressive hints, reflect, and submit. Teachers can create classes, publish assignments, and review submission status.

## What judges can test

1. Create or sign in to a **teacher** account and create a class.
2. Create a Newton's Second Law assignment and publish it.
3. Create or sign in to a **student** account, join with the class code, and save a few interests such as basketball, Formula 1, or space.
4. Start the published assignment. Prism generates or retrieves a validated personalized scenario while preserving the teacher's objective.
5. Change variables, request a hint, complete the guided steps and reflection, then submit.
6. Return to the teacher workspace to see the student's submission status.

The public fixture-backed sandbox demo is also available at `sandbox-demo.html` after starting Vite. It needs no sign-in or external API call.

## Architecture and safety

- **Frontend:** React 19, TypeScript, Vite, Three.js for bounded renderer-owned visual scenes.
- **Backend:** Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic.
- **Data and auth:** PostgreSQL/Supabase and Clerk JWT verification via JWKS.
- **AI:** OpenAI Responses API with strict structured output, schema validation, caching, and a deterministic fixture fallback.
- **Safety boundary:** AI returns only validated content for approved sandbox components. It cannot generate or execute HTML, JavaScript, SQL, formulas, shaders, or arbitrary 3D assets.

The central design decision is to personalize the **context**, not the academic target. The backend rejects outputs that change the original learning objective or request a different sandbox type. Physics calculations run in a finite frontend formula registry, and the backend owns authorization, session versions, completion rules, and submission state.

## Quick start

### Prerequisites

- Python 3.12
- Node.js 20+
- A Clerk development instance
- An OpenAI API key for live personalization, or `DEMO_MODE=true` for the deterministic fallback
- PostgreSQL. Docker is optional and only needed for the bundled local database. A hosted Supabase Postgres connection works without Docker.

### 1. Configure environment variables

Copy the template. Never commit the resulting `.env` file.

```powershell
Copy-Item .env.example .env
```

Set values from one Clerk development instance, plus your database connection:

```text
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:PORT/postgres
CLERK_ISSUER=https://YOUR_INSTANCE.clerk.accounts.dev
CLERK_JWKS_URL=https://YOUR_INSTANCE.clerk.accounts.dev/.well-known/jwks.json
CLERK_AUTHORIZED_PARTIES=http://localhost:5173
CLERK_SECRET_KEY=sk_test_...
OPENAI_API_KEY=sk-...
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_API_BASE_URL=http://localhost:8000
```

In Clerk, add `http://localhost:5173` as an allowed origin and redirect URL. Keep backend secrets out of all `VITE_*` variables.

### 2. Install, migrate, and run

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -e ".\backend[dev]"
npm ci
.\.venv\Scripts\alembic -c backend/alembic.ini upgrade head
.\.venv\Scripts\uvicorn app.main:app --app-dir backend --reload
```

In a second terminal:

```powershell
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). API documentation is available at [http://localhost:8000/docs](http://localhost:8000/docs).

### Optional local Postgres with Docker

```powershell
docker compose up -d db
.\.venv\Scripts\alembic -c backend/alembic.ini upgrade head
```

Uvicorn still runs directly from the command above and reads the ignored root `.env` file. Do not use Docker when your `DATABASE_URL` points to Supabase.

## Sample data and demo modes

For an isolated local or disposable demo database, run the idempotent seed after migrations:

```powershell
$env:PYTHONPATH = "backend"
.\.venv\Scripts\python backend\app\scripts\seed_demo.py
```

It creates a Physics class (`PRISM101`), three sample student records with basketball, Formula 1, and space interests, and a published Newton's Second Law assignment. It intentionally does **not** create Clerk credentials, so use it only to inspect data or alongside separately provisioned local demo accounts. Never run this seed against production or a shared judging database.

For a rehearsed demo without OpenAI availability, set `DEMO_MODE=true`. The app uses a deterministic, contract-valid fixture provider; the same progress and submission workflow remains available.

## Tests and quality checks

```powershell
.\.venv\Scripts\ruff check backend
.\.venv\Scripts\pytest backend/tests
npm test
npm run build
```

## Deployment

- Deploy the FastAPI backend to Railway using the repository-root `railway.toml`.
- Deploy the Vite frontend to Vercel. The committed `vercel.json` proxies `/api/*` to Railway.
- Put backend-only values in Railway, and only `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_BASE_URL` in Vercel.
- Apply `alembic -c backend/alembic.ini upgrade head` against the deployment database before releasing a schema change.
- Add the deployed Vercel URL to Clerk's allowed origins and to Railway's `CLERK_AUTHORIZED_PARTIES`, then update Railway `FRONTEND_URL`.

See [docs/staging-runbook.md](docs/staging-runbook.md) for the complete staging checklist.

## How Codex and GPT-5.6 accelerated the project

This repository was developed with Codex, using GPT-5.6 for the implementation workflow. Codex accelerated the work by:

- Reading the architecture, API, schema, and role-handoff documents before changes, then turning the MVP into phased implementation and verification work.
- Building and connecting the FastAPI routes, SQLAlchemy data model, Alembic migrations, Clerk authentication integration, authorization checks, and API tests.
- Implementing the structured AI provider interface, Responses API integration, schema validation, caching, deterministic fixture provider, and safety invariants.
- Integrating the React teacher and student workflows with the sandbox, progressive hints, session persistence, submission flow, responsive visual design, and bounded Three.js scenes.
- Diagnosing deployment and local-auth configuration issues, improving documentation, and repeatedly running lint, backend tests, frontend tests, builds, and migration-head checks.

Key decisions were reviewed against the project contracts rather than delegated to the model: the learning objective must remain invariant, model output is data rather than executable code, authorization is enforced on the backend, and every sandbox format must be finite, validated, and testable. GPT-5.6 and Codex were used as an engineering collaborator for implementation, debugging, test generation, and documentation; the application itself uses the separately configured OpenAI API at runtime and can fall back deterministically for demos.

Codex session ID for the implementation work: `019f67e8-c6c9-7db1-8759-0782c44e613a`.

## Repository access and license

For judging, use the repository URL above. If the repository is private, grant access to `testing@devpost.com` and `build-week-event@openai.com` before submitting. If it is public, add a license that matches the team's intended sharing terms before judging. No license has been selected in this repository yet.

## More documentation

- [Product context](docs/product-context.md)
- [Architecture plan](docs/architecture-plan.md)
- [API contracts](docs/api-contracts.md)
- [Database schema](docs/database-schema.md)
- [Backend configuration](backend/README.md)
