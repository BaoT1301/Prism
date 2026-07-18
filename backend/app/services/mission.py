from __future__ import annotations

from dataclasses import dataclass
from typing import Any


SUPPORTED_OPERATORS = {"greater_than_or_equal", "less_than_or_equal", "between"}


@dataclass(frozen=True)
class ConstraintResult:
    id: str
    label: str
    satisfied: bool
    current_value: float | None
    message: str


def calculate_outputs(spec: dict[str, Any], responses: dict[str, Any]) -> dict[str, float]:
    formula_id = spec.get("formula_id")
    if formula_id != "force_equals_mass_times_acceleration":
        raise ValueError("Unsupported formula.")
    mass = responses.get("mass")
    acceleration = responses.get("acceleration")
    if not isinstance(mass, (int, float)) or isinstance(mass, bool):
        return {"force": 0.0}
    if not isinstance(acceleration, (int, float)) or isinstance(acceleration, bool):
        return {"force": 0.0}
    return {"force": float(mass) * float(acceleration)}


def evaluate_mission(spec: dict[str, Any], responses: dict[str, Any]) -> dict[str, Any]:
    mission = spec.get("mission") or {}
    outputs = calculate_outputs(spec, responses)
    values = {**responses, **outputs}
    results: list[dict[str, Any]] = []
    for constraint in mission.get("visible_constraints", []):
        field = constraint.get("field")
        current = values.get(field)
        operator = constraint.get("operator")
        satisfied = isinstance(current, (int, float)) and not isinstance(current, bool)
        if satisfied and operator == "greater_than_or_equal":
            satisfied = current >= constraint["value"]
        elif satisfied and operator == "less_than_or_equal":
            satisfied = current <= constraint["value"]
        elif satisfied and operator == "between":
            satisfied = constraint["min"] <= current <= constraint["max"]
        else:
            satisfied = False
        results.append({
            "id": constraint["id"],
            "label": constraint["label"],
            "satisfied": satisfied,
            "current_value": float(current) if isinstance(current, (int, float)) else None,
            "message": "On target" if satisfied else "Adjust the experiment to meet this constraint.",
        })
    required_ids = set((mission.get("success_condition") or {}).get("constraint_ids", []))
    by_id = {item["id"]: item for item in results}
    complete = bool(required_ids) and all(by_id.get(item, {}).get("satisfied", False) for item in required_ids)
    bonus = mission.get("bonus_condition") or {}
    return {
        "complete": complete,
        "outputs": outputs,
        "constraints": results,
        "bonus": {"enabled": bool(bonus.get("enabled")), "complete": False, "attempted": False},
    }


def validate_mission(spec: dict[str, Any]) -> None:
    mission = spec.get("mission")
    if not isinstance(mission, dict):
        raise ValueError("Sandbox mission is required.")
    if mission.get("schema_version") != "1.0" or mission.get("evaluator_version") != "numeric-v1":
        raise ValueError("Unsupported mission version.")
    variable_ids = {item.get("id") for item in spec.get("variables", [])}
    output_ids = {"force"}
    controls = mission.get("controls", [])
    if not controls or any(item.get("variable_id") not in variable_ids for item in controls):
        raise ValueError("Mission controls must reference sandbox variables.")
    constraints = mission.get("visible_constraints", [])
    constraint_ids: set[str] = set()
    for constraint in constraints:
        identifier = constraint.get("id")
        field = constraint.get("field")
        operator = constraint.get("operator")
        if not identifier or identifier in constraint_ids or field not in variable_ids | output_ids:
            raise ValueError("Mission constraint reference is invalid.")
        if operator not in SUPPORTED_OPERATORS:
            raise ValueError("Mission operator is unsupported.")
        if operator == "between":
            if not isinstance(constraint.get("min"), (int, float)) or not isinstance(constraint.get("max"), (int, float)) or constraint["min"] > constraint["max"]:
                raise ValueError("Mission constraint range is invalid.")
        elif not isinstance(constraint.get("value"), (int, float)):
            raise ValueError("Mission constraint threshold is invalid.")
        constraint_ids.add(identifier)
    success = mission.get("success_condition") or {}
    if success.get("operator") != "AND" or not success.get("constraint_ids"):
        raise ValueError("Mission success condition is invalid.")
    if not set(success["constraint_ids"]).issubset(constraint_ids):
        raise ValueError("Mission success condition references an unknown constraint.")
