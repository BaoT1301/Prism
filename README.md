# Prism

Backend foundation for the personalized learning platform.

## Local development

Requirements: Python 3.12 and Docker (for PostgreSQL).

    Copy-Item .env.example .env
    py -3.12 -m venv .venv
    .\.venv\Scripts\python -m pip install -e ".\backend[dev]"
    docker compose up -d db
    .\.venv\Scripts\alembic -c backend/alembic.ini upgrade head
    .\.venv\Scripts\uvicorn app.main:app --app-dir backend --reload

Open http://localhost:8000/docs or call GET /health.

Run checks:

    .\.venv\Scripts\ruff check backend
    .\.venv\Scripts\pytest backend/tests

See backend/README.md for migration and Supabase auth details.
