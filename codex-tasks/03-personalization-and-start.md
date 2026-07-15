# Task 03 â€” Personalization Provider and Start Assignment

Read `AGENTS.md`, the product invariants, API contracts, database schema, sandbox JSON schema, and the completed code.

Coordinate with the AI teammate's existing code. Reuse their provider implementation if present rather than replacing it.

## Goal

Implement the backend personalization boundary and idempotent student assignment-start flow.

## Required components

### Provider interface

Create or finalize:

- `PersonalizationProvider`
- `OpenAIPersonalizationProvider`
- `FixturePersonalizationProvider`

The fixture provider is required for tests and demo fallback.

### OpenAI integration

Use the Responses API and the configured model.

Requirements:

- Structured output matching typed Pydantic models
- Valid `sandbox_spec`
- Bounded output
- Configured timeout
- Retry transient errors with a bounded policy
- One correction retry for invalid structured output
- Provider request ID and latency logging when available
- No secret or full sensitive prompt logging
- Explicit `store` choice documented
- Moderation or safety checks appropriate for student text
- Treat interest values as untrusted data, not instructions

### Validation

Validate:

- Exact source learning objective preservation
- Assignment content version
- Supported sandbox type
- Allowed formula ID
- Variable min/max/default/step consistency
- Unique variable and step IDs
- Reasonable text and array limits
- No executable code fields
- JSON schema compliance
- No initial final-answer leakage according to a practical rule or evaluation fixture

### Start endpoint

Implement:

- `POST /api/v1/assignments/{assignment_id}/start`

Behavior:

- Verify student role
- Verify class membership
- Verify published assignment
- Require interest profile
- Cache by assignment ID, assignment content version, student ID, and interest version
- Avoid duplicate generated rows and unnecessary duplicate model calls
- Create or resume sandbox session
- Return `cache_status`
- Support deterministic fixture fallback when explicitly enabled

### Failure states

- Pending generation conflict
- Provider timeout
- Invalid output
- Unsupported sandbox
- Missing profile
- Rate limit
- Controlled fallback

## Tests

Use fake provider by default.

Cover:

- Cache miss
- Cache hit
- Concurrent or duplicate start behavior
- Interest version invalidation
- Assignment content version invalidation
- Membership rejection
- Unpublished rejection
- Invalid AI output
- One correction retry
- Provider timeout
- Fixture fallback
- Objective invariant
- Schema validation
- No model call in ordinary tests

Add optional marked live-provider smoke test, disabled by default.

## Out of scope

- Full tutor chat UI
- Frontend renderer
- Arbitrary generated code
- Background queue
- Multiple new sandbox templates
- Submission

## Acceptance criteria

- Golden fixture validates.
- Start is idempotent.
- Tests and lint pass.
- AI behavior is replaceable and does not contaminate route logic.
- Stop after Task 03.
