# Codex Context Pack â€” Personalized Learning Platform

This folder is the handoff package for Codex and the engineering team.

## What each file does

- `AGENTS.md`: durable repository instructions that Codex should follow on every task.
- `docs/product-context.md`: product problem, users, MVP, demo flow, and non-goals.
- `docs/architecture-plan.md`: stack decisions, service boundaries, dependencies, sequencing, deployment, and team ownership.
- `docs/api-contracts.md`: REST endpoints, authentication behavior, payloads, errors, idempotency, and integration rules.
- `docs/database-schema.md`: PostgreSQL tables, fields, constraints, indexes, relationships, and migration order.
- `contracts/sandbox-spec.schema.json`: machine-readable contract between the AI service and interactive sandbox.
- `codex-tasks/*.md`: bounded implementation prompts to give Codex one at a time.

## Important distinction

Use all three layers together:

1. **`AGENTS.md`** tells Codex how to work in this repository every time.
2. **`docs/`** tells Codex what the system is and how it should be designed.
3. **A task prompt** tells Codex what to implement in the current turn.

Do not paste only `AGENTS.md` and expect Codex to infer the implementation order. Do not ask it to â€œbuild everythingâ€ in one task. Run the task files sequentially and review each diff before starting the next phase.

## Recommended order

1. Copy this entire pack into the root of the Git repository.
2. Commit it before implementation begins.
3. Open Codex in the repository root.
4. Give Codex `codex-tasks/00-repository-assessment.md`.
5. Review its plan.
6. Give Codex `codex-tasks/01-backend-foundation.md`.
7. Run and review the resulting application, migrations, and tests.
8. Continue with tasks 02â€“05 in order.

## Your role

Bao owns the backend, API, database foundation, authentication integration, and backend integration decisions. The AI teammate owns prompt behavior and evaluation; the sandbox teammate owns the renderer. Their integration boundaries are documented in the contracts.

## Human-owned setup that Codex cannot safely invent

You must create or provide:

- GitHub repository access
- Supabase project
- Supabase project URL and publishable key
- Supabase database connection string
- OpenAI API key or hackathon credits
- Deployment accounts and project permissions
- Final model selection if the hackathon environment changes
- Team decisions when an API or contract needs to change

Never commit real secrets.
