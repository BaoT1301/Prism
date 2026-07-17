from typing import Any
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.sessions import SandboxSessionResponse


class ReflectionQuestion(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    question: str = Field(min_length=1, max_length=500)


class GeneratedContent(BaseModel):
    personalized_title: str = Field(min_length=1, max_length=240)
    scenario: str = Field(min_length=1, max_length=2000)
    problem_statement: str = Field(min_length=1, max_length=3000)
    learning_objective: str = Field(min_length=1, max_length=4000)
    instructions: list[str] = Field(min_length=1, max_length=8)
    reflection_questions: list[ReflectionQuestion] = Field(default_factory=list, max_length=5)
    sandbox_spec: dict[str, Any]
    provider_response_id: str | None = None


class GeneratedAssignmentResponse(BaseModel):
    id: uuid.UUID
    assignment_id: uuid.UUID
    student_id: uuid.UUID
    personalized_title: str
    scenario: str
    problem_statement: str
    learning_objective: str
    instructions: list[str]
    reflection_questions: list[ReflectionQuestion]
    sandbox_spec: dict[str, Any]
    generated_at: datetime


class StartResponse(BaseModel):
    generated_assignment: GeneratedAssignmentResponse
    cache_status: Literal["hit", "miss"]
    session: SandboxSessionResponse
