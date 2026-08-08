"""Add generation pending lease and submission generated-assignment index.

Adds ``generated_assignments.pending_expires_at`` so a crashed in-flight PENDING
generation becomes reclaimable (H2), and indexes ``submissions.generated_assignment_id``
which was the only unindexed foreign key (L5).
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b7f3c1a9d2e4"
down_revision: str | Sequence[str] | None = "a27c8a345abc"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

timestamp = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.add_column("generated_assignments", sa.Column("pending_expires_at", timestamp, nullable=True))
    op.create_index("ix_submissions_generated_assignment_id", "submissions", ["generated_assignment_id"])


def downgrade() -> None:
    op.drop_index("ix_submissions_generated_assignment_id", table_name="submissions")
    op.drop_column("generated_assignments", "pending_expires_at")
