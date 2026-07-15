
from pydantic import BaseModel, Field, field_validator


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
