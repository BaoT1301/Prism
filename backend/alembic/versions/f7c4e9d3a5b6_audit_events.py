"""Add audit_events table for the actor-scoped audit log (M7).

Creates ``audit_events`` recording (actor, action, target_type, target_id, created_at).
``actor_id`` is RESTRICT so an audited profile cannot vanish; ``target_id`` is a free UUID
pointer with no FK because it may reference rows in different tables (or be null). Indexed on
(actor_id, created_at) for the newest-first ``/me/audit`` feed.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f7c4e9d3a5b6"
down_revision: str | Sequence[str] | None = "e6b3d8c2f4a5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)
timestamp = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "audit_events",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("actor_id", UUID, sa.ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("target_type", sa.String(50), nullable=False),
        sa.Column("target_id", UUID),
        sa.Column("created_at", timestamp, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_audit_events_actor_id", "audit_events", ["actor_id"])
    op.create_index("ix_audit_events_actor_created", "audit_events", ["actor_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_events_actor_created", table_name="audit_events")
    op.drop_index("ix_audit_events_actor_id", table_name="audit_events")
    op.drop_table("audit_events")
