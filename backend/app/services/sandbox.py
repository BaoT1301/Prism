from typing import Any


def _variable_map(spec: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item["id"]: item for item in spec.get("variables", []) if isinstance(item, dict) and "id" in item}


def _check_satisfied(check: dict[str, Any], variables: dict[str, dict[str, Any]], responses: dict[str, Any], reflection_answers: dict[str, str]) -> bool:
    check_type = check.get("type")
    if check_type == "reflection_answered":
        question_id = check.get("question_id")
        return bool(question_id and reflection_answers.get(question_id, "").strip())
    variable_id = check.get("variable_id")
    variable = variables.get(variable_id)
    value = responses.get(variable_id)
    if variable is None or not isinstance(value, (int, float)) or isinstance(value, bool):
        return False
    default = variable.get("default")
    if not isinstance(default, (int, float)):
        return False
    if check_type == "value_changed":
        return value != default
    if check_type == "value_increased":
        return value > default
    if check_type == "value_decreased":
        return value < default
    return False


def automatic_step_ids(
    spec: dict[str, Any],
    responses: dict[str, Any],
    reflection_answers: dict[str, str] | None = None,
) -> set[str]:
    variables = _variable_map(spec)
    answers = reflection_answers or {}
    completed: set[str] = set()
    for step in spec.get("guided_steps", []):
        checks = step.get("completion_checks", [])
        if checks and all(_check_satisfied(check, variables, responses, answers) for check in checks):
            completed.add(step["id"])
    return completed


def submission_ready(spec: dict[str, Any], completed_step_ids: set[str], reflection_answers: dict[str, str]) -> bool:
    all_steps = {step["id"] for step in spec.get("guided_steps", [])}
    questions = {question["id"] for question in spec.get("reflection_questions", [])}
    for rule in spec.get("completion_rules", []):
        if rule.get("type") == "all_steps_completed" and not all_steps.issubset(completed_step_ids):
            return False
        if rule.get("type") == "step_completed" and rule.get("step_id") not in completed_step_ids:
            return False
        if rule.get("type") == "reflection_answered" and not all(reflection_answers.get(question_id, "").strip() for question_id in questions):
            return False
    return bool(spec.get("completion_rules"))


def build_progressive_hint(
    spec: dict[str, Any],
    responses: dict[str, Any],
    completed_step_ids: list[str],
    hint_level: int,
    current_step_id: str | None,
) -> str:
    steps = {step["id"]: step for step in spec.get("guided_steps", [])}
    step = steps.get(current_step_id) if current_step_id else None
    if step is None:
        step = next((item for item in spec.get("guided_steps", []) if item["id"] not in completed_step_ids), None)
    variable_id = next((check.get("variable_id") for check in (step or {}).get("completion_checks", []) if check.get("variable_id")), "mass")
    variable = _variable_map(spec).get(variable_id, {"label": variable_id})
    label = variable.get("label", variable_id)
    hints = [
        f"Focus on {label.lower()} while working on this step. What happens when you change it?",
        f"Keep the other variable steady and compare the calculated force before and after changing {label.lower()}.",
        f"Use force = mass × acceleration to explain why the force changed when {label.lower()} changed.",
    ]
    return hints[max(0, min(hint_level - 1, len(hints) - 1))]
