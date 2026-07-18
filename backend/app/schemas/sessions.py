import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.models.models import SandboxSessionStatus


class ReflectionAnswer(BaseModel):
    question_id: str = Field(min_length=1, max_length=40)
    answer: str = Field(max_length=2000)

    @field_validator("answer")
    @classmethod
    def normalize_answer(cls, value: str) -> str:
        return value.strip()


class ProgressRequest(BaseModel):
    expected_version: int = Field(ge=1)
    completed_step_ids: list[str] = Field(max_length=8)
    responses: dict[str, Any] = Field(default_factory=dict)
    reflection_answers: list[ReflectionAnswer] = Field(default_factory=list, max_length=5)
    experiment_event: dict[str, Any] | None = None


class HintRequest(BaseModel):
    question: str | None = Field(default=None, max_length=500)
    current_step_id: str | None = Field(default=None, max_length=40)


class SubmitRequest(BaseModel):
    expected_session_version: int = Field(ge=1)
    reflection_answers: list[ReflectionAnswer] = Field(default_factory=list, max_length=5)


class SandboxSessionResponse(BaseModel):
    id: uuid.UUID
    version: int = Field(ge=1)
    status: SandboxSessionStatus
    completed_step_ids: list[str]
    responses: dict[str, Any]
    reflection_answers: list[ReflectionAnswer]
    hints_used: int = Field(ge=0)
    submitted_at: datetime | None
    updated_at: datetime
    mission_evaluation: dict[str, Any] | None = None
    interaction_events: list[dict[str, Any]] = Field(default_factory=list)
    feedback: dict[str, Any] | None = None


class HintResponse(BaseModel):
    hint_level: int = Field(ge=1, le=3)
    hint: str
    remaining_hint_levels: int = Field(ge=0, le=3)


class SubmissionResponse(BaseModel):
    id: uuid.UUID
    assignment_id: uuid.UUID
    student_id: uuid.UUID
    status: str
    submitted_at: datetime
    feedback: dict[str, Any] | None = None


class SubmissionSummaryResponse(BaseModel):
    submission_id: uuid.UUID
    student_id: uuid.UUID
    student_name: str
    status: str
    submitted_at: datetime | None


class SubmissionListResponse(BaseModel):
    items: list[SubmissionSummaryResponse]
    total: int = Field(ge=0)


class AssignmentProgressResponse(BaseModel):
    student_id: uuid.UUID
    student_name: str
    status: Literal["not_started", "in_progress", "submitted"]
    completed_steps: int = Field(ge=0)
    total_steps: int = Field(ge=0)
    hints_used: int = Field(ge=0)
    submitted_at: datetime | None
    feedback: dict[str, Any] | None = None


class AssignmentProgressListResponse(BaseModel):
    items: list[AssignmentProgressResponse]
    total: int = Field(ge=0)
