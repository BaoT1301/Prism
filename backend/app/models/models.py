import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import JSON


class Base(DeclarativeBase):
    pass


JsonType = JSON().with_variant(JSONB, "postgresql")


def enum_type(enum_class: type[enum.Enum], name: str) -> Enum:
    return Enum(
        enum_class,
        name=name,
        native_enum=False,
        create_constraint=True,
        values_callable=lambda values: [item.value for item in values],
    )


class UserRole(str, enum.Enum):
    TEACHER = "teacher"
    STUDENT = "student"


class AssignmentStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class GenerationStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


class SandboxSessionStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    SUBMITTED = "submitted"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class Profile(TimestampMixin, Base):
    __tablename__ = "profiles"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    auth_user_id: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[UserRole] = mapped_column(enum_type(UserRole, "user_role"), nullable=False)
    classes_taught: Mapped[list["Class"]] = relationship(back_populates="teacher", foreign_keys="Class.teacher_id")
    memberships: Mapped[list["ClassMember"]] = relationship(back_populates="student")
    interest_profile: Mapped["InterestProfile | None"] = relationship(back_populates="student", uselist=False)


class Class(TimestampMixin, Base):
    __tablename__ = "classes"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    teacher_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    subject: Mapped[str] = mapped_column(String(100), nullable=False)
    grade_level: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    join_code: Mapped[str] = mapped_column(String(12), nullable=False, unique=True)
    teacher: Mapped[Profile] = relationship(back_populates="classes_taught", foreign_keys=[teacher_id])
    members: Mapped[list["ClassMember"]] = relationship(back_populates="class_", cascade="all, delete-orphan")
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="class_")
    __table_args__ = (Index("ix_classes_teacher_created", "teacher_id", "created_at"),)


class ClassMember(Base):
    __tablename__ = "class_members"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    class_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("classes.id", ondelete="CASCADE"), nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False, index=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    class_: Mapped[Class] = relationship(back_populates="members")
    student: Mapped[Profile] = relationship(back_populates="memberships")
    __table_args__ = (UniqueConstraint("class_id", "student_id", name="uq_class_member"), Index("ix_class_members_class_joined", "class_id", "joined_at"))


class Assignment(TimestampMixin, Base):
    __tablename__ = "assignments"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    class_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("classes.id", ondelete="RESTRICT"), nullable=False, index=True)
    teacher_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    topic: Mapped[str] = mapped_column(String(200), nullable=False)
    learning_objective: Mapped[str] = mapped_column(Text, nullable=False)
    grade_level: Mapped[str] = mapped_column(String(40), nullable=False)
    instructions: Mapped[str | None] = mapped_column(Text)
    sandbox_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[AssignmentStatus] = mapped_column(
        enum_type(AssignmentStatus, "assignment_status"),
        nullable=False,
        server_default="draft",
    )
    content_version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    class_: Mapped[Class] = relationship(back_populates="assignments")
    __table_args__ = (CheckConstraint("content_version >= 1", name="ck_assignments_content_version"), CheckConstraint("sandbox_type = 'parameter_explorer'", name="ck_assignments_sandbox_type"), Index("ix_assignments_class_status", "class_id", "status"), Index("ix_assignments_class_created", "class_id", "created_at"))


class InterestProfile(TimestampMixin, Base):
    __tablename__ = "interest_profiles"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False, unique=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    sports: Mapped[list[str]] = mapped_column(JsonType, nullable=False, server_default="[]")
    games: Mapped[list[str]] = mapped_column(JsonType, nullable=False, server_default="[]")
    movies: Mapped[list[str]] = mapped_column(JsonType, nullable=False, server_default="[]")
    hobbies: Mapped[list[str]] = mapped_column(JsonType, nullable=False, server_default="[]")
    career_interests: Mapped[list[str]] = mapped_column(JsonType, nullable=False, server_default="[]")
    favorite_animals: Mapped[list[str]] = mapped_column(JsonType, nullable=False, server_default="[]")
    favorite_subjects: Mapped[list[str]] = mapped_column(JsonType, nullable=False, server_default="[]")
    additional_interests: Mapped[list[str]] = mapped_column(JsonType, nullable=False, server_default="[]")
    student: Mapped[Profile] = relationship(back_populates="interest_profile")
    __table_args__ = (CheckConstraint("version >= 1", name="ck_interest_profiles_version"),)


class GeneratedAssignment(Base):
    __tablename__ = "generated_assignments"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assignments.id", ondelete="RESTRICT"), nullable=False, index=True)
    assignment_content_version: Mapped[int] = mapped_column(Integer, nullable=False)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False, index=True)
    interest_profile_version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[GenerationStatus] = mapped_column(
        enum_type(GenerationStatus, "generation_status"), nullable=False
    )
    personalized_title: Mapped[str | None] = mapped_column(String(240))
    scenario: Mapped[str | None] = mapped_column(Text)
    problem_statement: Mapped[str | None] = mapped_column(Text)
    learning_objective: Mapped[str | None] = mapped_column(Text)
    instructions: Mapped[list[str] | None] = mapped_column(JsonType)
    reflection_questions: Mapped[list[dict[str, Any]] | None] = mapped_column(JsonType)
    sandbox_spec: Mapped[dict[str, Any] | None] = mapped_column(JsonType)
    model: Mapped[str | None] = mapped_column(String(100))
    prompt_version: Mapped[str | None] = mapped_column(String(50))
    provider_response_id: Mapped[str | None] = mapped_column(String(200))
    generation_latency_ms: Mapped[int | None] = mapped_column(Integer)
    failure_code: Mapped[str | None] = mapped_column(String(100))
    failure_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        UniqueConstraint("assignment_id", "assignment_content_version", "student_id", "interest_profile_version", name="uq_generated_assignment_cache"),
        Index("ix_generated_assignments_student_created", "student_id", "created_at"),
    )


class SandboxSession(TimestampMixin, Base):
    __tablename__ = "sandbox_sessions"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    generated_assignment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("generated_assignments.id", ondelete="RESTRICT"), nullable=False, index=True)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False, index=True)
    status: Mapped[SandboxSessionStatus] = mapped_column(
        enum_type(SandboxSessionStatus, "sandbox_session_status"),
        nullable=False,
        server_default="in_progress",
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    progress: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False, server_default="{}")
    responses: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False, server_default="{}")
    completed_step_ids: Mapped[list[str]] = mapped_column(JsonType, nullable=False, server_default="[]")
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    hints_used: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        UniqueConstraint("generated_assignment_id", "student_id", name="uq_sandbox_session_generation_student"),
        CheckConstraint("version >= 1", name="ck_sandbox_sessions_version"),
        CheckConstraint("attempt_count >= 0", name="ck_sandbox_sessions_attempt_count"),
        CheckConstraint("hints_used >= 0", name="ck_sandbox_sessions_hints_used"),
        Index("ix_sandbox_sessions_student_updated", "student_id", "updated_at"),
    )


class Submission(Base):
    __tablename__ = "submissions"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("assignments.id", ondelete="RESTRICT"), nullable=False, index=True)
    generated_assignment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("generated_assignments.id", ondelete="RESTRICT"), nullable=False)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sandbox_sessions.id", ondelete="RESTRICT"), nullable=False, unique=True)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("profiles.id", ondelete="RESTRICT"), nullable=False, index=True)
    responses_snapshot: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)
    reflection_answers: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, nullable=False, server_default="[]")
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    __table_args__ = (
        UniqueConstraint("assignment_id", "student_id", name="uq_submission_assignment_student"),
        Index("ix_submissions_assignment_submitted", "assignment_id", "submitted_at"),
    )
