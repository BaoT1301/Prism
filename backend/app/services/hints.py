from __future__ import annotations

import asyncio
import json
from typing import Any

from openai import AsyncOpenAI

from app.core.config import Settings
from app.services.mission import evaluate_mission


def _safe_hint(value: str) -> str:
    lowered = value.lower()
    if not value.strip() or any(marker in lowered for marker in ("<script", "javascript:", "force =", "mass =", "acceleration =")):
        raise ValueError("Unsafe or answer-revealing hint.")
    return value.strip()


def _variable_label(spec: dict[str, Any], variable_id: str) -> str:
    for variable in spec.get("variables", []):
        if variable.get("id") == variable_id:
            return str(variable.get("label", variable_id)).lower()
    return variable_id.replace("_", " ").lower()


def fallback_hint(
    spec: dict[str, Any],
    responses: dict[str, Any],
    events: list[dict[str, Any]],
    hint_level: int,
    current_step_id: str | None = None,
) -> str:
    slider_events = [event for event in events if event.get("event_type") == "slider_changed"]
    runs = [event for event in events if event.get("event_type") == "experiment_run"]
    if not slider_events and not runs:
        return "Start by changing one setting, then observe what happens to the calculated result."
    recent_variables = [event.get("variable_id") for event in slider_events[-4:]]
    if len(set(recent_variables)) >= 2 and not any(event.get("controlled_comparison") for event in runs[-2:]):
        return "Try changing only one setting between two experiments so you can tell which variable affected the result."
    if slider_events:
        latest = slider_events[-1]
        label = _variable_label(spec, str(latest.get("variable_id", "setting")))
        direction = "up" if latest.get("value", 0) > latest.get("previous_value", 0) else "down"
        if hint_level == 1:
            return f"You moved {label} {direction}. Keep the other setting steady and notice how the result responds."
        if hint_level == 2:
            return f"Use your {label} change as a comparison: what would you expect if only the other setting changed?"

    evaluation = evaluate_mission(spec, responses)
    failed = next((item for item in evaluation["constraints"] if not item["satisfied"]), None)
    if failed:
        return f"Look closely at the constraint '{failed['label']}'. Which setting could move the current result toward that requirement?"
    if runs:
        return "You found a valid configuration. Try a different combination and compare what stays the same."
    return "Run an experiment, then compare the result before and after changing one setting."


class OpenAIHintProvider:
    def __init__(self, settings: Settings) -> None:
        if not settings.openai_api_key:
            raise RuntimeError("OpenAI is not configured.")
        self.client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=8.0, max_retries=0)
        self.model = settings.openai_model

    async def generate(
        self,
        spec: dict[str, Any],
        responses: dict[str, Any],
        events: list[dict[str, Any]],
        hint_level: int,
        question: str | None = None,
        current_step_id: str | None = None,
    ) -> str:
        prompt = {
            "objective": spec.get("introduction"),
            "current_step_id": current_step_id,
            "question": question,
            "responses": responses,
            "interaction_history": events[-8:],
            "hint_level": hint_level,
            "rules": [
                "Guide reasoning without giving exact target values or the final answer.",
                "Use the student's observed interaction pattern when it is relevant.",
                "Do not mention hidden information.",
                "Return one concise, actionable hint.",
                "Do not provide code or executable content.",
            ],
        }
        response = await self.client.responses.create(model=self.model, store=False, input=json.dumps(prompt))
        return _safe_hint(response.output_text)

    def generate_sync(
        self,
        spec: dict[str, Any],
        responses: dict[str, Any],
        events: list[dict[str, Any]],
        hint_level: int,
        question: str | None = None,
        current_step_id: str | None = None,
    ) -> str:
        return asyncio.run(self.generate(spec, responses, events, hint_level, question, current_step_id))
