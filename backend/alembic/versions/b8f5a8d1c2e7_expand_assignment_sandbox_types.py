"""Enable the approved graph and guided sandbox formats."""

from collections.abc import Sequence

from alembic import op


revision: str = "b8f5a8d1c2e7"
down_revision: str | Sequence[str] | None = "a27c8a345abc"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_assignments_sandbox_type", "assignments", type_="check")
    op.create_check_constraint(
        "ck_assignments_sandbox_type",
        "assignments",
        "sandbox_type IN ('parameter_explorer', 'graph_lab', 'guided_activity')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_assignments_sandbox_type", "assignments", type_="check")
    op.create_check_constraint(
        "ck_assignments_sandbox_type",
        "assignments",
        "sandbox_type = 'parameter_explorer'",
    )
