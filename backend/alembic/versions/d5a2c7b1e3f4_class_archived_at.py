"""Add classes.archived_at for class archiving.

Adds a nullable ``archived_at`` timestamptz to ``classes``. A non-null value archives the
class so it is excluded from the teacher's default class list (opt in with
``?include_archived=true``) without deleting any rows.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d5a2c7b1e3f4"
down_revision: str | Sequence[str] | None = "c4e1b8f6a9d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

timestamp = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.add_column("classes", sa.Column("archived_at", timestamp, nullable=True))


def downgrade() -> None:
    op.drop_column("classes", "archived_at")
