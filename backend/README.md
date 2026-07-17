# Backend

## Configuration

Copy the root .env.example to .env; never commit it. DATABASE_URL must be a
SQLAlchemy URL using psycopg, for example
postgresql+psycopg://user:password@host:5432/database.

Production requires DATABASE_URL, CLERK_JWKS_URL, CLERK_ISSUER,
CLERK_AUTHORIZED_PARTIES, and CLERK_SECRET_KEY. Authentication verifies Clerk session
tokens with the configured JWKS and validates signature, issuer, expiration, subject,
and authorized party. The secret key is used only to retrieve a verified user's primary
email when the application profile is first bootstrapped.

profiles.auth_user_id stores Clerk's immutable string user ID and has no foreign key to
an external identity table. The verified Clerk session-token subject is the application
trust boundary.

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
Clerk credentials and must not be run against production.
