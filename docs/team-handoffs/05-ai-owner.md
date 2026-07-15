# Person 5 - AI Personalization, Safety, and Evaluation

Read docs/team-handoffs/README.md, backend/app/services/personalization.py,
contracts/sandbox-spec.schema.json, and fixtures before editing.

## Own

- Prompt quality, fixtures, evaluation cases, model selection/cost/latency, and
  protected live-provider smoke tests.
- Work behind PersonalizationProvider; preserve route and database boundaries.

## Current implementation

- OpenAI uses the Responses API with structured JSON-schema output and store=false.
- Backend validates objective equality, JSON schema, supported sandbox values, and
  unsafe/executable-looking output before persistence.
- Fixture provider supports demo/testing.
- Existing hint endpoint is deterministic; propose an AI hint provider separately with
  safety tests before changing it.

## Evaluation cases

- Basketball, Formula 1, Space, and empty interests.
- Prompt-injection-like interests.
- Objective drift, schema-invalid output, unsafe code-like output, and final-answer
  leakage.

## Do not

Do not edit migrations, authorization, routes, or the sandbox contract alone. Do not
log prompts containing student interests or credentials.
