# Prism

Personalized learning platform: FastAPI backend and React/Vite sandbox frontend.

## Local development

Requirements: Python 3.12, Node.js 20+, and Docker only when using the bundled local
PostgreSQL database. A hosted Supabase database does not require Docker for normal
development.

    Copy-Item .env.example .env
    py -3.12 -m venv .venv
    .\.venv\Scripts\python -m pip install -e ".\backend[dev]"
    docker compose up -d db
    .\.venv\Scripts\alembic -c backend/alembic.ini upgrade head
    .\.venv\Scripts\uvicorn app.main:app --app-dir backend --reload

Open http://localhost:8000/docs or call GET /health.

## Frontend application

    npm ci
    npm run dev

Open the Vite URL shown by the command (normally http://localhost:5173). Set
`VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_BASE_URL` in the root `.env` to use
Clerk sign-in and the authenticated teacher/student flows. The backend also needs
the Clerk variables listed in `.env.example`.

The standalone sandbox demo at `/sandbox-demo.html` remains fixture-backed, but the main application uses
the shared Clerk client and launches the sandbox against the authenticated API.

Run checks:

    .\.venv\Scripts\ruff check backend
    .\.venv\Scripts\pytest backend/tests
    npm test
    npm run build

See backend/README.md for migration and Clerk auth details.
See docs/staging-runbook.md before deploying or running the live demo flow.
