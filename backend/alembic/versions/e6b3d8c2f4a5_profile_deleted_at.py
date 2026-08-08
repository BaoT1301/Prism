"""Add profiles.deleted_at for GDPR account soft-delete (M7).

Adds a nullable ``deleted_at`` timestamptz to ``profiles``. Account erasure sets this,
anonymizes email/display_name, and retains the row because every FK into ``profiles`` is
ondelete=RESTRICT. ``require_profile`` treats a non-null ``deleted_at`` as not-provisioned.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e6b3d8c2f4a5"
down_revision: str | Sequence[str] | None = "d5a2c7b1e3f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

timestamp = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.add_column("profiles", sa.Column("deleted_at", timestamp, nullable=True))


def downgrade() -> None:
    op.drop_column("profiles", "deleted_at")
