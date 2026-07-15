# Task 01 â€” Backend and Database Foundation

Read `AGENTS.md`, all files under `docs/`, `contracts/sandbox-spec.schema.json`, and the result of Task 00.

Inspect the repository before changing files.

## Goal

Create a production-structured backend foundation for Bao's scope without implementing the complete product or AI workflow.

## In scope

### Repository foundation

- Preserve existing teammate code.
- Create the documented backend structure.
- Add or update the root `.gitignore`.
- Add `.env.example` with names and safe placeholders only.
- Add local development commands and README instructions.

### FastAPI

- Application factory or clean application initialization
- `/health`
- Optional `/ready` with database check
- `/api/v1` router
- CORS configuration from environment
- Request ID middleware
- Shared error format
- Structured logging without secrets
- OpenAPI metadata

### Configuration

Typed settings for:

- environment
- log level
- database URL
- Supabase URL
- Supabase JWKS URL
- expected issuer
- expected audience
- OpenAI API key
- OpenAI model
- moderation model
- frontend URL
- demo mode

Fail clearly when required production configuration is absent. Allow tests to inject settings.

### Database

- SQLAlchemy 2 setup
- Session dependency
- Models from `docs/database-schema.md`
- Relationships
- Constraints
- Indexes
- Alembic configuration
- Initial migration
- Migration documentation

Before creating the migration, inspect whether the selected Supabase connection can create a foreign key to `auth.users`. If uncertain, implement `profiles.auth_user_id` as a unique UUID and document the application-level trust boundary rather than creating an invalid cross-schema migration.

### Authentication structure

- Bearer-token dependency
- JWT verification using the Supabase JWKS strategy
- Validation of signature, issuer, audience, expiration, and subject
- Auth claims model
- Authenticated profile dependency
- Teacher dependency
- Student dependency
- No real credentials required for tests
- Dependency overrides or fake verifier for tests

### Profile endpoints

Implement:

- `GET /api/v1/me`
- `POST /api/v1/profiles/bootstrap`

Profile bootstrap must not trust user ID or email in the request body. It uses verified claims.

### Tooling

- `pyproject.toml`
- Pinned or bounded dependencies
- Ruff
- Pytest
- Type checking if practical
- Dockerfile
- `docker-compose.yml` for backend and local PostgreSQL
- Makefile or documented commands if it improves usability

Do not add Redis.

## Tests

At minimum:

- Health success
- OpenAPI generation
- Missing token
- Malformed token
- Expired token
- Wrong issuer
- Wrong audience
- Authenticated profile success
- Profile not provisioned
- Profile bootstrap
- Duplicate bootstrap behavior
- Teacher role dependency
- Student role dependency
- Important database uniqueness constraints
- Migration upgrade from empty database

Tests must run without production credentials.

## Out of scope

- Class CRUD
- Membership
- Assignment CRUD
- Interest profile API
- OpenAI calls
- Personalized assignment generation
- Sandbox sessions
- Hints
- Submission
- Frontend implementation
- Deployment to a real account

## Acceptance criteria

- Backend starts locally.
- `/health` returns 200.
- Swagger loads.
- Initial migration upgrades a clean PostgreSQL database.
- Auth tests pass without a live Supabase request.
- No secret is committed.
- All required models exist and match the documented schema or any deviation is explained.
- Ruff and tests pass.
- Codex stops after this task.

## Completion report

Include:

- Architecture created
- Files changed
- Dependencies added
- Migration summary
- Constraints and indexes
- Commands run
- Exact test results
- Required environment variables
- Assumptions
- Known risks
- Items for Task 02
