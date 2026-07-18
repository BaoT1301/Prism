from __future__ import annotations

from typing import Any


def build_adaptive_feedback(session: Any, evaluation: dict[str, Any]) -> dict[str, Any]:
    events = session.progress.get("interaction_events", []) if isinstance(session.progress, dict) else []
    successful = [event for event in events if event.get("mission_complete")]
    hints = session.hints_used
    attempts = len([event for event in events if event.get("event_type") == "experiment_run"])
    random_experimentation = attempts >= 3 and not any(event.get("controlled_comparison") for event in events)
    return {
        "status": "ready",
        "concepts_mastered": ["Force depends on mass and acceleration."] if successful else [],
        "areas_of_confusion": ["Try changing one variable at a time."] if random_experimentation else [],
        "explanation": "Your successful configuration met every mission constraint." if successful else "Keep testing the relationship between mass, acceleration, and force.",
        "recommended_next_steps": ["Compare two configurations while holding one variable steady."],
        "follow_up_practice": "Find another mass and acceleration pair that produces a similar force.",
        "teacher_summary": {
            "attempts": attempts,
            "hints_used": hints,
            "random_experimentation": random_experimentation,
            "mastery": "demonstrated" if successful else "in progress",
        },
        "mission_evaluation": evaluation,
    }
