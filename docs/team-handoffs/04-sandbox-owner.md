# Person 4 - Parameter Explorer Sandbox

Read docs/team-handoffs/README.md, contracts/sandbox-spec.schema.json, and fixtures
under contracts/examples/. Do not change the schema without Persons 1 and 5.

## Own

Build the renderer for sandbox_type parameter_explorer.

## Requirements

- Render title, scenario, variables, units, guided steps, completion, reflection,
  and progress.
- Implement force_equals_mass_times_acceleration deterministically as force = mass *
  acceleration.
- Never evaluate a formula string or execute generated content.
- Render the basketball fixture without a backend/OpenAI request.

## Backend integration

- PATCH /api/v1/sandbox-sessions/{session_id}/progress
- POST /api/v1/sandbox-sessions/{session_id}/hint
- POST /api/v1/sandbox-sessions/{session_id}/submit

For progress, send expected_version and update it from successful responses. On 409,
reload the session and let the user retry. Hints are capped at three by the backend.

## Acceptance flow

Sliders update force, guided steps complete, progress saves, hints display, and
reflection answers submit.
