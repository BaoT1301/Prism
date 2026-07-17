
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.models import AssignmentStatus


class ClassCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    subject: str = Field(min_length=1, max_length=100)
    grade_level: str = Field(min_length=1, max_length=40)
    description: str | None = Field(default=None, max_length=2000)


class JoinClassRequest(BaseModel):
    join_code: str = Field(min_length=4, max_length=12)


class AssignmentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    topic: str = Field(min_length=1, max_length=200)
    learning_objective: str = Field(min_length=1, max_length=4000)
    grade_level: str = Field(min_length=1, max_length=40)
    instructions: str | None = Field(default=None, max_length=4000)
    sandbox_type: str


class AssignmentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    topic: str | None = Field(default=None, min_length=1, max_length=200)
    learning_objective: str | None = Field(default=None, min_length=1, max_length=4000)
    grade_level: str | None = Field(default=None, min_length=1, max_length=40)
    instructions: str | None = Field(default=None, max_length=4000)
    sandbox_type: str | None = None


class InterestsRequest(BaseModel):
    sports: list[str] = Field(default_factory=list, max_length=20)
    games: list[str] = Field(default_factory=list, max_length=20)
    movies: list[str] = Field(default_factory=list, max_length=20)
    hobbies: list[str] = Field(default_factory=list, max_length=20)
    career_interests: list[str] = Field(default_factory=list, max_length=20)
    favorite_animals: list[str] = Field(default_factory=list, max_length=20)
    favorite_subjects: list[str] = Field(default_factory=list, max_length=20)
    additional_interests: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("*")
    @classmethod
    def normalize(cls, values: list[str]) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()
        for value in values:
            normalized = value.strip()
            if not normalized or len(normalized) > 80 or normalized.casefold() in seen:
                continue
            seen.add(normalized.casefold())
            result.append(normalized)
        return result


class ClassResponse(BaseModel):
    id: uuid.UUID
    teacher_id: uuid.UUID
    name: str
    subject: str
    grade_level: str
    description: str | None
    join_code: str
    student_count: int = Field(ge=0)
    assignment_count: int = Field(ge=0)
    created_at: datetime


class ClassListResponse(BaseModel):
    items: list[ClassResponse]
    total: int = Field(ge=0)


class ClassMembershipResponse(BaseModel):
    class_id: uuid.UUID
    student_id: uuid.UUID
    joined_at: datetime


class ClassMemberResponse(BaseModel):
    student_id: uuid.UUID
    display_name: str
    joined_at: datetime


class ClassMemberListResponse(BaseModel):
    items: list[ClassMemberResponse]
    total: int = Field(ge=0)


class AssignmentResponse(BaseModel):
    id: uuid.UUID
    class_id: uuid.UUID
    teacher_id: uuid.UUID
    title: str
    topic: str
    learning_objective: str
    grade_level: str
    instructions: str | None
    sandbox_type: str
    status: AssignmentStatus
    content_version: int = Field(ge=1)
    published_at: datetime | None
    created_at: datetime


class AssignmentListResponse(BaseModel):
    items: list[AssignmentResponse]
    total: int = Field(ge=0)


class InterestProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    student_id: uuid.UUID
    version: int = Field(ge=1)
    sports: list[str]
    games: list[str]
    movies: list[str]
    hobbies: list[str]
    career_interests: list[str]
    favorite_animals: list[str]
    favorite_subjects: list[str]
    additional_interests: list[str]
    updated_at: datetime
