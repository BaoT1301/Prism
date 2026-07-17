"""Store Clerk user identifiers in profiles."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "a27c8a345abc"
down_revision: str | Sequence[str] | None = "d4dfa1e52e29"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "profiles",
        "auth_user_id",
        existing_type=postgresql.UUID(as_uuid=True),
        type_=sa.String(length=128),
        existing_nullable=False,
        postgresql_using="auth_user_id::text",
    )


def downgrade() -> None:
    raise RuntimeError("Cannot safely convert Clerk user identifiers back to UUID values.")
