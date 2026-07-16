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

## Frontend sandbox demo

    npm ci
    npm run dev

Open the Vite URL shown by the command (normally http://localhost:5173). This is a
fixture-backed sandbox demo; the production student host must use Supabase Auth and
the shared API client documented in `docs/team-handoffs/06-integration-devops-qa.md`.

Run checks:

    .\.venv\Scripts\ruff check backend
    .\.venv\Scripts\pytest backend/tests
    npm test
    npm run build

See backend/README.md for migration and Supabase auth details.
