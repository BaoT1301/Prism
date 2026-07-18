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


def fallback_hint(spec: dict[str, Any], responses: dict[str, Any], events: list[dict[str, Any]], hint_level: int) -> str:
    runs = [event for event in events if event.get("event_type") == "experiment_run"]
    if not runs:
        return "Run one experiment, then compare the calculated force with the mission constraints."
    if len(runs) >= 2 and not any(event.get("controlled_comparison") for event in runs[-2:]):
        return "Try changing only one setting between two experiments so you can tell which variable affected the result."
    evaluation = evaluate_mission(spec, responses)
    failed = next((item for item in evaluation["constraints"] if not item["satisfied"]), None)
    if failed:
        return f"Look closely at the constraint '{failed['label']}'. Which setting could move the current result toward that requirement?"
    return "You found a valid configuration. Try a different combination and compare what stays the same."


class OpenAIHintProvider:
    def __init__(self, settings: Settings) -> None:
        if not settings.openai_api_key:
            raise RuntimeError("OpenAI is not configured.")
        self.client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=8.0, max_retries=0)
        self.model = settings.openai_model

    async def generate(self, spec: dict[str, Any], responses: dict[str, Any], events: list[dict[str, Any]], hint_level: int) -> str:
        prompt = {
            "mission": spec.get("mission"),
            "responses": responses,
            "interaction_history": events[-8:],
            "hint_level": hint_level,
            "rules": ["Guide reasoning without giving exact values.", "Do not mention hidden information.", "Return one concise hint.", "Do not provide code or formulas."],
        }
        response = await self.client.responses.create(model=self.model, store=False, input=json.dumps(prompt))
        return _safe_hint(response.output_text)

    def generate_sync(self, spec: dict[str, Any], responses: dict[str, Any], events: list[dict[str, Any]], hint_level: int) -> str:
        return asyncio.run(self.generate(spec, responses, events, hint_level))
