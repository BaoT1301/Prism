# Staging Runbook

Use a non-production Supabase project for this checklist.

1. Set backend secrets in the backend host: `DATABASE_URL`, `SUPABASE_JWKS_URL`,
   `SUPABASE_ISSUER`, `SUPABASE_AUDIENCE`, `OPENAI_API_KEY`, `FRONTEND_URL`, and
   `DEMO_MODE=false`.
2. Apply the migration with `alembic -c backend/alembic.ini upgrade head` and confirm
   `alembic -c backend/alembic.ini current` reports `d4dfa1e52e29`.
3. Set frontend public variables: `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY`, and `VITE_API_BASE_URL`.
4. In Supabase Auth, add the deployed frontend URL and local `http://localhost:5173`
   to redirect URLs. Never expose a service-role key to the frontend.
5. Set the deployed frontend URL in backend `FRONTEND_URL`, deploy both services, and
   verify `/health`, `/ready`, and `/docs`.
6. Create one teacher and three students in Supabase Auth. Bootstrap their profiles
   through the app; do not run local demo seeds against staging.
7. Run the teacher-to-student smoke flow and keep `DEMO_MODE=true` only for a
   deliberate rehearsal fallback.
