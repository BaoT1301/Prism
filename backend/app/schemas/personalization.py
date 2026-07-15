from typing import Any

from pydantic import BaseModel, Field


class GeneratedContent(BaseModel):
    personalized_title: str = Field(min_length=1, max_length=240)
    scenario: str = Field(min_length=1, max_length=2000)
    problem_statement: str = Field(min_length=1, max_length=3000)
    learning_objective: str = Field(min_length=1, max_length=4000)
    instructions: list[str] = Field(min_length=1, max_length=8)
    reflection_questions: list[str] = Field(default_factory=list, max_length=5)
    sandbox_spec: dict[str, Any]
    provider_response_id: str | None = None


class StartResponse(BaseModel):
    generated_assignment: dict[str, Any]
    cache_status: str
    session: dict[str, Any]
