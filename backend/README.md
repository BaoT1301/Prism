# Backend

## Configuration

Copy the root .env.example to .env; never commit it. DATABASE_URL must be a
SQLAlchemy URL using psycopg, for example
postgresql+psycopg://user:password@host:5432/database.

Production requires DATABASE_URL, SUPABASE_JWKS_URL, SUPABASE_ISSUER, and
SUPABASE_AUDIENCE. Authentication verifies asymmetric Supabase JWTs using the
configured JWKS and validates signature, issuer, audience, expiration, and subject.

profiles.auth_user_id deliberately has no foreign key to auth.users: this repository
has no Supabase connection or confirmed permission to create a cross-schema foreign
key. The verified JWT subject is the application trust boundary. Add a cross-schema FK
only after confirming it works in the target Supabase migration role.

## Migrations

    .\.venv\Scripts\alembic -c backend/alembic.ini upgrade head
    .\.venv\Scripts\alembic -c backend/alembic.ini current

The initial migration creates every documented MVP table, constraints, and indexes.
Future schema changes must be new migrations.

## Demo seed

After migrating a local/demo database, run:

    .\.venv\Scripts\python -m app.scripts.seed_demo

This creates an idempotent teacher, three students, a Physics class, memberships,
interest profiles, and a published Newton's Second Law assignment. It never creates
Supabase credentials and must not be run against production.
