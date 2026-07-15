from typing import Any

from pydantic import BaseModel, Field


class ProgressRequest(BaseModel):
    expected_version: int = Field(ge=1)
    completed_step_ids: list[str] = Field(max_length=8)
    responses: dict[str, Any] = Field(default_factory=dict)


class HintRequest(BaseModel):
    question: str | None = Field(default=None, max_length=500)
    current_step_id: str | None = Field(default=None, max_length=40)


class SubmitRequest(BaseModel):
    expected_session_version: int = Field(ge=1)
    reflection_answers: list[dict[str, str]] = Field(default_factory=list, max_length=5)
