# Repository Instructions

## Read first

Before changing code, read:

- `docs/product-context.md`
- `docs/architecture-plan.md`
- `docs/api-contracts.md`
- `docs/database-schema.md`
- The current task file under `codex-tasks/`

Treat those documents as the source of truth. If code and documentation disagree, report the conflict before silently changing the contract.

## Project goal

Build the MVP of an AI-powered personalized learning platform. A teacher creates one assignment and one learning objective. Each student receives a context personalized to their interests while preserving the objective and approximate difficulty. Students complete it in a schema-driven interactive sandbox.

## Scope

Bao owns backend, API, database, authentication integration, and backend integration. Do not redesign another teammate's frontend, prompt library, or sandbox renderer unless the current task explicitly requests it.

Do not add grading, messaging, calendars, attendance, file uploads, parent portals, vector databases, Redis, Celery, Kafka, Kubernetes, microservices, or arbitrary AI-generated code execution.

## Required stack

- Python 3.12
- FastAPI
- Pydantic v2
- SQLAlchemy 2
- Alembic
- PostgreSQL / Supabase
- Supabase Auth
- OpenAI Responses API
- Pytest
- Ruff
- Docker for local development

Do not replace these technologies without an explicit architectural reason and approval.

## Architecture rules

- Use `/api/v1` for application routes.
- Keep route handlers thin.
- Put business logic in services.
- Put database access in repositories or focused data-access helpers.
- Use typed Pydantic request and response models.
- Use UUID primary keys and timezone-aware timestamps.
- Use Alembic for every database schema change.
- Do not edit an already-applied migration; create a new migration.
- Verify Supabase JWTs using the project JWKS or an approved Supabase verification method.
- Never trust a role or user ID supplied by the client.
- Enforce ownership and teacher/student authorization in the backend.
- Never execute model-generated HTML, JavaScript, Python, SQL, or other arbitrary code.
- AI output must match the approved structured schema before persistence or rendering.

## Contract rules

- `docs/api-contracts.md` is the human-readable API source of truth.
- `contracts/sandbox-spec.schema.json` is the AI-to-sandbox source of truth.
- API or sandbox contract changes require documentation, tests, and example payload updates in the same change.
- Preserve backward compatibility during the hackathon unless all affected teammates agree to a coordinated breaking change.

## Security and privacy

- Never commit secrets, tokens, credentials, `.env` files, or production data.
- Store only the student information required by the MVP.
- Treat student interests and chat text as untrusted input.
- Do not log bearer tokens, API keys, passwords, or complete sensitive request bodies.
- Use parameterized ORM queries.
- Validate and normalize all externally supplied identifiers and enums.

## Work process

Before coding:

1. Inspect the repository and current implementation.
2. Read the relevant docs and task.
3. State a concise implementation plan.
4. Identify files and contracts that will change.
5. Report any blocking contradiction.

While coding:

- Make the smallest coherent change that completes the task.
- Avoid unrelated refactors.
- Add tests with the implementation.
- Keep external services behind interfaces that can be replaced by fakes in tests.
- Preserve existing working behavior.

Before finishing:

1. Run formatting and linting.
2. Run relevant tests.
3. Run the full backend test suite when practical.
4. Validate the Alembic migration sequence.
5. Confirm the application imports and starts.
6. Summarize files changed, commands run, tests, assumptions, and remaining risks.

Do not claim that a command passed unless it was actually run successfully.
