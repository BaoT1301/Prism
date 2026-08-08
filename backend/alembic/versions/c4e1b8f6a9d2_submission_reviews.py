"""Add submission_reviews for teacher grading and feedback.

Creates the ``submission_reviews`` table: one review per submission (unique
``submission_id``, CASCADE with the submission) carrying an optional 0..100 score and a
required (default '') feedback body. Enables the Phase 2 grading/feedback loop.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c4e1b8f6a9d2"
down_revision: str | Sequence[str] | None = "b7f3c1a9d2e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)
timestamp = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "submission_reviews",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("submission_id", UUID, sa.ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("reviewer_id", UUID, sa.ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("score", sa.Integer()),
        sa.Column("feedback", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", timestamp, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", timestamp, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("score IS NULL OR (score >= 0 AND score <= 100)", name="ck_submission_reviews_score"),
    )
    op.create_index("ix_submission_reviews_reviewer_id", "submission_reviews", ["reviewer_id"])


def downgrade() -> None:
    op.drop_index("ix_submission_reviews_reviewer_id", table_name="submission_reviews")
    op.drop_table("submission_reviews")
