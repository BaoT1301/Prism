# Architecture Plan

## 1. Architecture principles

1. Build a complete vertical slice early instead of finishing every backend endpoint before integration.
2. Freeze contracts before parallel implementation.
3. Let frontend developers work against committed fixtures and OpenAPI examples.
4. Keep infrastructure intentionally small.
5. Use managed authentication and database services.
6. Make AI output structured, validated, cached, and replaceable with deterministic fixtures.
7. Keep the sandbox schema-driven; never execute arbitrary generated code.
8. Prefer a boring, reliable monolith over premature microservices.

## 2. Recommended stack

### Frontend

- Next.js
- TypeScript
- App Router
- Tailwind CSS
- shadcn/ui
- TanStack Query
- React Hook Form
- Zod
- Recharts
- KaTeX
- Playwright

Frontend owners may adjust component libraries, but the backend contract must remain independent of presentation choices.

### Backend

- Python 3.12
- FastAPI
- Pydantic v2
- SQLAlchemy 2
- Alembic
- PostgreSQL driver compatible with the selected Supabase connection string
- Pytest
- Ruff
- OpenAI Python SDK

### Managed services

- Supabase Postgres
- Supabase Auth
- OpenAI Responses API
- Vercel for frontend
- Railway, Render, Fly.io, or another persistent container host for FastAPI
- GitHub Actions for CI

The exact backend host may change without affecting application architecture.

## 3. Why this stack

### FastAPI over Express

FastAPI gives the backend owner:

- Typed validation
- Pydantic integration
- Automatic OpenAPI documentation
- Straightforward Python OpenAI SDK usage
- Clear request/response contracts
- Good testability through dependency overrides

A single-language TypeScript stack would reduce language switching, but strong validation and the AI/data workflow are more important for this MVP.

### Supabase Auth over custom JWT authentication

Custom signup, password storage, refresh-token logic, email verification, and reset flows are not the product innovation. Supabase Auth should issue the user access token. FastAPI verifies the token and loads the application profile and role.

New Supabase projects should prefer asymmetric signing keys and JWKS verification. The backend must not rely on a client-provided role.

### REST over GraphQL

The domain is resource-oriented and small. REST plus OpenAPI is faster for six people to coordinate and easier to test.

### SSE over WebSockets

Use normal REST for CRUD and progress. Use server-sent events only if tutor responses are streamed through the backend. This application does not need a persistent bidirectional collaboration channel.

### Synchronous request orchestration over a job queue

For the MVP, assignment generation can occur when the student first starts the assignment:

1. Check cache.
2. Generate if absent.
3. Validate.
4. Persist.
5. Return.

Do not add Redis or a worker queue unless measured generation latency makes the vertical slice unusable. A polished loading state and pre-generated demo records are sufficient.

## 4. High-level architecture

```text
Browser / Next.js
    |
    | Supabase login and session
    | Authorization: Bearer <access token>
    v
FastAPI monolith
    |- auth dependencies
    |- class service
    |- assignment service
    |- personalization orchestration
    |- sandbox session service
    |- submission service
    |- OpenAPI
    |
    +--> Supabase Postgres
    |
    +--> OpenAI Responses API
```

### Data flow for assignment start

1. Student requests `POST /api/v1/assignments/{assignment_id}/start`.
2. Backend verifies JWT.
3. Backend loads the application profile.
4. Backend verifies student role, class membership, and published status.
5. Backend loads the student's current interest profile.
6. Backend computes the generation cache key from:
   - assignment ID
   - assignment content version
   - student ID
   - interest profile version
7. Backend returns an existing generated assignment when present.
8. Otherwise backend calls the AI personalization interface.
9. Backend validates the structured result and product invariants.
10. Backend retries once for correctable model-output errors.
11. Backend persists the generated assignment and metadata.
12. Backend returns the personalized assignment.
13. Frontend creates or resumes a sandbox session.

## 5. Service boundaries

### FastAPI routes

Routes translate HTTP to typed service calls. They must not contain substantial business logic.

### Domain services

- `AuthService`
- `ClassService`
- `AssignmentService`
- `InterestProfileService`
- `PersonalizationService`
- `SandboxSessionService`
- `SubmissionService`

### Repositories

Repositories or focused data-access helpers own database queries. Avoid one giant generic repository abstraction.

### AI provider interface

The backend owns an interface that the AI teammate can implement:

```python
class PersonalizationProvider(Protocol):
    async def generate_assignment(
        self,
        *,
        assignment: AssignmentGenerationContext,
        interests: InterestProfileContext,
    ) -> GeneratedAssignmentContent:
        ...

    async def generate_hint(
        self,
        *,
        generated_assignment: GeneratedAssignmentContent,
        session: SandboxSessionContext,
        hint_level: int,
        student_question: str | None,
    ) -> HintContent:
        ...
```

Provide both:

- `OpenAIPersonalizationProvider`
- `FixturePersonalizationProvider`

Tests and demo fallback must not require a live model call.

## 6. Repository structure

```text
/
â”œâ”€â”€ AGENTS.md
â”œâ”€â”€ README.md
â”œâ”€â”€ docs/
â”œâ”€â”€ codex-tasks/
â”œâ”€â”€ contracts/
â”‚   â””â”€â”€ sandbox-spec.schema.json
â”œâ”€â”€ backend/
â”‚   â”œâ”€â”€ pyproject.toml
â”‚   â”œâ”€â”€ Dockerfile
â”‚   â”œâ”€â”€ alembic.ini
â”‚   â”œâ”€â”€ alembic/
â”‚   â”œâ”€â”€ app/
â”‚   â”‚   â”œâ”€â”€ api/
â”‚   â”‚   â”‚   â”œâ”€â”€ dependencies/
â”‚   â”‚   â”‚   â””â”€â”€ routes/
â”‚   â”‚   â”œâ”€â”€ core/
â”‚   â”‚   â”œâ”€â”€ db/
â”‚   â”‚   â”œâ”€â”€ models/
â”‚   â”‚   â”œâ”€â”€ repositories/
â”‚   â”‚   â”œâ”€â”€ schemas/
â”‚   â”‚   â”œâ”€â”€ services/
â”‚   â”‚   â”‚   â””â”€â”€ ai/
â”‚   â”‚   â””â”€â”€ main.py
â”‚   â””â”€â”€ tests/
â”œâ”€â”€ frontend/
â”‚   â””â”€â”€ existing or teammate-owned implementation
â”œâ”€â”€ docker-compose.yml
â””â”€â”€ .github/workflows/
```

Codex must not overwrite an existing frontend.

## 7. Environment variables

Backend:

```text
ENVIRONMENT
LOG_LEVEL
DATABASE_URL
SUPABASE_URL
SUPABASE_JWKS_URL
SUPABASE_ISSUER
SUPABASE_AUDIENCE
OPENAI_API_KEY
OPENAI_MODEL
OPENAI_MODERATION_MODEL
FRONTEND_URL
DEMO_MODE
```

Frontend-owned variables may include:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_API_BASE_URL
```

Do not put a Supabase secret/service key in the browser.

## 8. Authentication and authorization

### Authentication

- Frontend authenticates with Supabase Auth.
- Frontend passes the access token to FastAPI.
- FastAPI verifies signature, issuer, audience, expiration, and subject.
- FastAPI maps `sub` to `profiles.auth_user_id`.
- FastAPI returns 401 for missing, invalid, or expired tokens.

### Application authorization

- `profiles.role` is the source of truth for teacher/student application role.
- Teacher ownership checks use database relationships.
- Student membership checks use `class_members`.
- Authorization failures return 403 without revealing data existence unnecessarily.

### Profile provisioning

Choose one implementation and document it:

Preferred MVP approach:

- After signup, frontend calls a protected profile bootstrap endpoint with a role selected during onboarding.
- The endpoint creates the profile once.
- Role cannot be changed through ordinary profile updates.

Alternative:

- Database trigger creates a profile from trusted auth metadata.

Do not let repeated client requests arbitrarily change roles.

## 9. AI architecture

### Responses API

Use the OpenAI Responses API for new model requests.

### Structured output

The generated assignment must map to typed Pydantic models and the sandbox JSON schema.

### Validation layers

1. JSON/schema parsing
2. Supported enum validation
3. Numerical range validation
4. Formula registry validation
5. Product invariant validation
6. Safety checks
7. Persistence

### Retry policy

- Retry transient provider errors with bounded exponential backoff.
- Retry one structured-output correction when the model returns invalid content.
- Do not retry validation errors indefinitely.
- Fall back to a deterministic fixture for the golden demo when `DEMO_MODE=true`.

### Storage and privacy

- Set model request storage according to project privacy requirements.
- Avoid sending unnecessary personal information.
- Send only the interests required for personalization.
- Do not log complete prompts containing user data in production logs.

### Cost control

- Cache generated assignments.
- Store model and prompt version.
- Use low or appropriate reasoning effort for routine structured generation.
- Set output limits.
- Avoid a separate model call for interest normalization unless testing proves it improves quality.

## 10. Sandbox architecture

The sandbox renderer is a finite component registry:

```text
sandbox_type -> frontend renderer
formula_id   -> deterministic calculation implementation
```

The AI may choose supported values and configure:

- Labels
- Units
- Numeric ranges
- Initial values
- Scenario text
- Guided steps
- Reflection questions
- Completion rules

The AI may not provide:

- JavaScript
- HTML
- Python
- SQL
- Shell commands
- Arbitrary formulas to evaluate
- External URLs to execute

Initial formula registry example:

```text
force_equals_mass_times_acceleration
```

## 11. Dependency-driven build order

Do not complete the entire backend before frontend work begins.

### Foundation dependency

These must be decided first:

- Product invariants
- Database entities
- API routes and payload shapes
- Sandbox schema
- Authentication flow
- Error format

### Parallel work after contracts

- Teacher frontend uses fixtures.
- Student frontend uses fixtures.
- Sandbox renderer uses committed schema examples.
- AI owner generates outputs against the same schema.
- Backend owner builds real endpoints.
- Integration owner deploys continuously.

### Critical path

1. Authenticated profile
2. Teacher creates class
3. Student joins class
4. Teacher creates and publishes assignment
5. Student saves interests
6. Student starts assignment
7. Backend returns valid personalized assignment
8. Sandbox renders
9. Progress saves
10. Submission succeeds
11. Teacher sees completion

## 12. Six-person ownership

### Person 1 â€” Bao: backend/API/database lead

Own:

- FastAPI structure
- Database models and migrations
- Supabase JWT verification
- Role authorization
- Class, assignment, interest, start, session, and submission APIs
- AI orchestration boundary
- Backend deployment
- OpenAPI
- Integration decisions

### Person 2 â€” teacher frontend

Own teacher pages and API integration using mocks before endpoints are ready.

### Person 3 â€” student frontend

Own student onboarding, join flow, dashboard, assignment launch, and submission confirmation.

### Person 4 â€” AI personalization

Own prompt library, structured-output behavior, safety, hint behavior, evaluation cases, and provider implementation behind the agreed interface.

### Person 5 â€” sandbox

Own schema-driven renderer, formula registry, interaction state, guided steps, completion logic, and hint presentation.

### Person 6 â€” integration/quality/demo

Own deployed smoke tests, generated frontend types, environment coordination, CI support, end-to-end test, seed/demo accounts, README, architecture image, and demo backup.

## 13. Deployment strategy

### Local

`docker-compose.yml` should provide:

- PostgreSQL
- FastAPI

Use hosted Supabase for true auth integration, or fake auth dependencies in tests.

### Staging

- One shared Supabase project
- One backend deployment
- One frontend deployment
- Seeded demo users and class
- CORS restricted to known frontend URLs
- Health endpoint

### Demo resilience

- Pre-generate the three golden personalized assignments.
- Keep `FixturePersonalizationProvider`.
- Use `DEMO_MODE` only as an explicit fallback.
- Record a backup demo.
- Do not rely on creating brand-new auth accounts during the live demonstration.

## 14. Observability

Minimum viable observability:

- Request ID
- Route
- Response status
- Duration
- User ID only when safe
- AI operation type
- Model
- Prompt version
- Provider request ID when available
- AI latency
- Cache hit/miss
- Generation success/failure
- Never log access tokens or API keys

## 15. Technical risks

### Contract drift

Mitigation: OpenAPI, committed examples, schema tests, coordinated breaking changes.

### Invalid AI output

Mitigation: Structured Outputs, validation, one correction retry, fixtures.

### Duplicate AI cost

Mitigation: database uniqueness and idempotent start behavior.

### Auth delays

Mitigation: Supabase Auth, dependency-overridden tests, seed profiles.

### Sandbox scope explosion

Mitigation: one reliable renderer first.

### Last-day integration

Mitigation: deployed vertical slice by the middle of the build period and continuous smoke testing.

### Merge conflicts

Mitigation: folder ownership, small PRs, short-lived branches, frequent merge to main.
