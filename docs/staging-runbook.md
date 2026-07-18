# Staging Runbook

Use a non-production Supabase project for this checklist.

1. For Railway, leave the service root directory at the repository root. The committed
   `railway.toml` selects `backend/Dockerfile` and includes the root `contracts/`
   directory required for sandbox validation. Set backend secrets in the backend host:
   `DATABASE_URL`, `CLERK_JWKS_URL`,
   `CLERK_ISSUER`, `CLERK_AUTHORIZED_PARTIES`, `CLERK_SECRET_KEY`, `OPENAI_API_KEY`,
   `FRONTEND_URL`, and `DEMO_MODE=false`.
2. Apply the migration with `alembic -c backend/alembic.ini upgrade head` and confirm
   `alembic -c backend/alembic.ini current` reports `a27c8a345abc`.
3. Set frontend public variables: `VITE_CLERK_PUBLISHABLE_KEY` and `VITE_API_BASE_URL`.
   Local development uses `VITE_API_BASE_URL` directly. On Vercel, the committed
   `vercel.json` proxies `/api/*` to Railway, so browser API calls remain same-origin
   and do not depend on Railway CORS for production or preview deployments.
4. In Clerk, add the deployed frontend URL and local `http://localhost:5173` as allowed
   origins/redirect URLs. Never expose `CLERK_SECRET_KEY` to the frontend.
5. Set the deployed frontend URL in backend `FRONTEND_URL`, deploy both services, and
   verify `/health`, `/ready`, and `/docs`.
6. Create one teacher and three students in Clerk. Bootstrap their profiles
   through the app; do not run local demo seeds against staging.
7. Run the teacher-to-student smoke flow and keep `DEMO_MODE=true` only for a
   deliberate rehearsal fallback.
