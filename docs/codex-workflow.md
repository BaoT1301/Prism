# Codex Workflow

## Use `AGENTS.md`, docs, and task prompts together

They solve different problems:

### `AGENTS.md`

Automatically supplies durable repository rules:

- Stack
- Scope
- Testing expectations
- Security constraints
- Architecture conventions
- How Codex should report work

Keep it concise enough to remain useful on every turn.

### `docs/`

Supplies stable product and engineering context:

- What is being built
- Why decisions were made
- Resource contracts
- Data model
- Boundaries between teammates

Codex should read the relevant documents before implementation.

### `codex-tasks/`

Supplies the bounded current objective. This is what you paste or reference when starting a Codex task.

A task should specify:

- Goal
- In scope
- Out of scope
- Acceptance criteria
- Required tests
- Commands to run
- What to report

## Why not one giant prompt

A request to â€œbuild the full backendâ€ can cause:

- Contract drift
- Unreviewable diffs
- Incorrect assumptions
- Overbuilding
- Weak tests
- Migration mistakes
- Conflicts with teammates
- Difficulty isolating regressions

The task files intentionally create review checkpoints.

## Recommended session sequence

### Task 00 â€” assessment

Use before implementation, especially if the repository already contains code.

Expected output:

- Existing structure
- Conflicts with architecture docs
- Proposed file plan
- Dependency choices
- Questions or explicit assumptions
- No implementation

### Task 01 â€” foundation

Expected output:

- FastAPI scaffold
- Configuration
- Database engine/session
- Models
- Alembic
- Auth verification structure
- Health and profile routes
- Docker
- Tests
- README

Review before continuing:

- Migration
- Auth verification
- Secret handling
- Test isolation
- Folder structure

### Task 02 â€” core domain API

Expected output:

- Classes
- Membership
- Assignments
- Interest profiles
- Authorization matrix
- OpenAPI examples
- Tests

Review:

- Teacher ownership
- Student visibility
- Idempotent joins
- Published/draft behavior

### Task 03 â€” personalization

Expected output:

- Provider interface
- OpenAI provider
- Fixture provider
- Structured output
- Validation
- Cached start endpoint
- Safety
- Tests

Review:

- Product invariants
- Duplicate costs
- Prompt injection handling
- No generated code execution
- Fallback

### Task 04 â€” sessions and submission

Expected output:

- Session resume
- Optimistic progress updates
- Progressive hints
- Submission transaction
- Teacher completion list
- Tests

Review:

- Ownership
- Concurrency
- Idempotency
- Data exposure

### Task 05 â€” hardening and deployment

Expected output:

- CI
- Deployment docs/config
- Logging
- Seed data
- Smoke tests
- End-to-end API test
- Security audit
- Clean OpenAPI

## How to start each Codex task

From the repository root, use wording such as:

```text
Read AGENTS.md, the relevant files under docs/, and codex-tasks/01-backend-foundation.md. Inspect the current repository first. Implement exactly that task, run the required checks, and stop when its acceptance criteria are met. Do not start the next phase.
```

## Review checklist after every task

1. Read the summary.
2. Inspect the complete diff.
3. Check for unrelated changes.
4. Search for secrets.
5. Review new dependencies.
6. Read migrations manually.
7. Run tests locally.
8. Start the API.
9. Open Swagger.
10. Exercise one happy path and one authorization failure.
11. Commit only after verification.

## Secrets

Codex may need environment-variable names, but never put actual secrets in prompts that will be saved or committed.

Use a local `.env` ignored by Git or the Codex cloud environment secret manager.

## Parallel Codex tasks

Parallel work is safe only when tasks have separate ownership and files.

Usually safe:

- Documentation
- Seed fixtures
- Independent test additions
- Frontend component work in an isolated feature folder

Usually unsafe:

- Two tasks editing the same models
- Two tasks creating Alembic migrations
- Two tasks changing auth dependencies
- Two tasks changing the sandbox contract
- Two tasks changing the same route family

Keep backend schema and migrations sequential.

## Human decisions that should not be delegated blindly

Bao must review:

- Database constraints
- Auth trust boundary
- Published-assignment editing policy
- Delete/cascade policy
- Interest-profile privacy
- Model and reasoning settings
- Deployment secrets
- API contract changes affecting teammates
- Any new production dependency
