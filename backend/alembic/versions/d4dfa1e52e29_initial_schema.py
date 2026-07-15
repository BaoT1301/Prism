"""Initial application schema."""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d4dfa1e52e29"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB
timestamp = sa.DateTime(timezone=True)
role = sa.Enum("teacher", "student", name="user_role", native_enum=False, create_constraint=True)
assignment_status = sa.Enum("draft", "published", "archived", name="assignment_status", native_enum=False, create_constraint=True)
generation_status = sa.Enum("pending", "completed", "failed", name="generation_status", native_enum=False, create_constraint=True)
session_status = sa.Enum("in_progress", "completed", "submitted", name="sandbox_session_status", native_enum=False, create_constraint=True)


def upgrade() -> None:
    op.create_table("profiles", sa.Column("id", UUID, primary_key=True), sa.Column("auth_user_id", UUID, nullable=False, unique=True), sa.Column("email", sa.String(320), nullable=False), sa.Column("display_name", sa.String(120), nullable=False), sa.Column("role", role, nullable=False), sa.Column("created_at", timestamp, nullable=False, server_default=sa.func.now()), sa.Column("updated_at", timestamp, nullable=False, server_default=sa.func.now()))
    op.create_table("classes", sa.Column("id", UUID, primary_key=True), sa.Column("teacher_id", UUID, sa.ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False), sa.Column("name", sa.String(160), nullable=False), sa.Column("subject", sa.String(100), nullable=False), sa.Column("grade_level", sa.String(40), nullable=False), sa.Column("description", sa.Text()), sa.Column("join_code", sa.String(12), nullable=False, unique=True), sa.Column("created_at", timestamp, nullable=False, server_default=sa.func.now()), sa.Column("updated_at", timestamp, nullable=False, server_default=sa.func.now()))
    op.create_index("ix_classes_teacher_id", "classes", ["teacher_id"])
    op.create_index("ix_classes_teacher_created", "classes", ["teacher_id", "created_at"])
    op.create_table("class_members", sa.Column("id", UUID, primary_key=True), sa.Column("class_id", UUID, sa.ForeignKey("classes.id", ondelete="CASCADE"), nullable=False), sa.Column("student_id", UUID, sa.ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False), sa.Column("joined_at", timestamp, nullable=False, server_default=sa.func.now()), sa.UniqueConstraint("class_id", "student_id", name="uq_class_member"))
    op.create_index("ix_class_members_student_id", "class_members", ["student_id"])
    op.create_index("ix_class_members_class_joined", "class_members", ["class_id", "joined_at"])
    op.create_table("assignments", sa.Column("id", UUID, primary_key=True), sa.Column("class_id", UUID, sa.ForeignKey("classes.id", ondelete="RESTRICT"), nullable=False), sa.Column("teacher_id", UUID, sa.ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False), sa.Column("title", sa.String(200), nullable=False), sa.Column("topic", sa.String(200), nullable=False), sa.Column("learning_objective", sa.Text(), nullable=False), sa.Column("grade_level", sa.String(40), nullable=False), sa.Column("instructions", sa.Text()), sa.Column("sandbox_type", sa.String(50), nullable=False), sa.Column("status", assignment_status, nullable=False, server_default="draft"), sa.Column("content_version", sa.Integer(), nullable=False, server_default="1"), sa.Column("published_at", timestamp), sa.Column("created_at", timestamp, nullable=False, server_default=sa.func.now()), sa.Column("updated_at", timestamp, nullable=False, server_default=sa.func.now()), sa.CheckConstraint("content_version >= 1", name="ck_assignments_content_version"), sa.CheckConstraint("sandbox_type = 'parameter_explorer'", name="ck_assignments_sandbox_type"))
    op.create_index("ix_assignments_class_id", "assignments", ["class_id"])
    op.create_index("ix_assignments_teacher_id", "assignments", ["teacher_id"])
    op.create_index("ix_assignments_class_status", "assignments", ["class_id", "status"])
    op.create_index("ix_assignments_class_created", "assignments", ["class_id", "created_at"])
    interest_columns = [sa.Column(name, JSONB, nullable=False, server_default="[]") for name in ("sports", "games", "movies", "hobbies", "career_interests", "favorite_animals", "favorite_subjects", "additional_interests")]
    op.create_table("interest_profiles", sa.Column("id", UUID, primary_key=True), sa.Column("student_id", UUID, sa.ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False, unique=True), sa.Column("version", sa.Integer(), nullable=False, server_default="1"), *interest_columns, sa.Column("created_at", timestamp, nullable=False, server_default=sa.func.now()), sa.Column("updated_at", timestamp, nullable=False, server_default=sa.func.now()), sa.CheckConstraint("version >= 1", name="ck_interest_profiles_version"))
    op.create_table("generated_assignments", sa.Column("id", UUID, primary_key=True), sa.Column("assignment_id", UUID, sa.ForeignKey("assignments.id", ondelete="RESTRICT"), nullable=False), sa.Column("assignment_content_version", sa.Integer(), nullable=False), sa.Column("student_id", UUID, sa.ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False), sa.Column("interest_profile_version", sa.Integer(), nullable=False), sa.Column("status", generation_status, nullable=False), sa.Column("personalized_title", sa.String(240)), sa.Column("scenario", sa.Text()), sa.Column("problem_statement", sa.Text()), sa.Column("learning_objective", sa.Text()), sa.Column("instructions", JSONB), sa.Column("reflection_questions", JSONB), sa.Column("sandbox_spec", JSONB), sa.Column("model", sa.String(100)), sa.Column("prompt_version", sa.String(50)), sa.Column("provider_response_id", sa.String(200)), sa.Column("generation_latency_ms", sa.Integer()), sa.Column("failure_code", sa.String(100)), sa.Column("failure_message", sa.Text()), sa.Column("created_at", timestamp, nullable=False, server_default=sa.func.now()), sa.Column("completed_at", timestamp), sa.UniqueConstraint("assignment_id", "assignment_content_version", "student_id", "interest_profile_version", name="uq_generated_assignment_cache"))
    op.create_index("ix_generated_assignments_assignment_id", "generated_assignments", ["assignment_id"])
    op.create_index("ix_generated_assignments_student_id", "generated_assignments", ["student_id"])
    op.create_index("ix_generated_assignments_student_created", "generated_assignments", ["student_id", "created_at"])
    op.create_table("sandbox_sessions", sa.Column("id", UUID, primary_key=True), sa.Column("generated_assignment_id", UUID, sa.ForeignKey("generated_assignments.id", ondelete="RESTRICT"), nullable=False), sa.Column("student_id", UUID, sa.ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False), sa.Column("status", session_status, nullable=False, server_default="in_progress"), sa.Column("version", sa.Integer(), nullable=False, server_default="1"), sa.Column("progress", JSONB, nullable=False, server_default="{}"), sa.Column("responses", JSONB, nullable=False, server_default="{}"), sa.Column("completed_step_ids", JSONB, nullable=False, server_default="[]"), sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"), sa.Column("hints_used", sa.Integer(), nullable=False, server_default="0"), sa.Column("started_at", timestamp, nullable=False, server_default=sa.func.now()), sa.Column("completed_at", timestamp), sa.Column("submitted_at", timestamp), sa.Column("updated_at", timestamp, nullable=False, server_default=sa.func.now()), sa.UniqueConstraint("generated_assignment_id", "student_id", name="uq_sandbox_session_generation_student"), sa.CheckConstraint("version >= 1", name="ck_sandbox_sessions_version"), sa.CheckConstraint("attempt_count >= 0", name="ck_sandbox_sessions_attempt_count"), sa.CheckConstraint("hints_used >= 0", name="ck_sandbox_sessions_hints_used"))
    op.create_index("ix_sandbox_sessions_generated_assignment_id", "sandbox_sessions", ["generated_assignment_id"])
    op.create_index("ix_sandbox_sessions_student_id", "sandbox_sessions", ["student_id"])
    op.create_index("ix_sandbox_sessions_student_updated", "sandbox_sessions", ["student_id", "updated_at"])
    op.create_table("submissions", sa.Column("id", UUID, primary_key=True), sa.Column("assignment_id", UUID, sa.ForeignKey("assignments.id", ondelete="RESTRICT"), nullable=False), sa.Column("generated_assignment_id", UUID, sa.ForeignKey("generated_assignments.id", ondelete="RESTRICT"), nullable=False), sa.Column("session_id", UUID, sa.ForeignKey("sandbox_sessions.id", ondelete="RESTRICT"), nullable=False, unique=True), sa.Column("student_id", UUID, sa.ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False), sa.Column("responses_snapshot", JSONB, nullable=False), sa.Column("reflection_answers", JSONB, nullable=False, server_default="[]"), sa.Column("submitted_at", timestamp, nullable=False, server_default=sa.func.now()), sa.UniqueConstraint("assignment_id", "student_id", name="uq_submission_assignment_student"))
    op.create_index("ix_submissions_assignment_id", "submissions", ["assignment_id"])
    op.create_index("ix_submissions_student_id", "submissions", ["student_id"])
    op.create_index("ix_submissions_assignment_submitted", "submissions", ["assignment_id", "submitted_at"])


def downgrade() -> None:
    for table in ("submissions", "sandbox_sessions", "generated_assignments", "interest_profiles", "assignments", "class_members", "classes", "profiles"):
        op.drop_table(table)
