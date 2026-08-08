"""Registry of the physics formulas supported inside the ``parameter_explorer`` sandbox.

Variety in the sandbox comes from ``formula_id`` (the DB ``sandbox_type`` CHECK stays
``parameter_explorer``), so this module is the single backend source of truth for which
formulas exist and what inputs/outputs each one has. The frontend calculator is built to
the same ``formula_id`` set, so the ids, variable ids, and units here MUST stay aligned
with it.

Each entry is intentionally declarative:

- ``label``     — human-readable formula name (used in prompts / teacher-facing copy).
- ``output``    — the computed quantity: ``{"label", "unit"}``.
- ``variables`` — the ordered inputs the formula needs: ``[{"id", "unit"}, ...]``. Every
  ``id`` here MUST appear among a spec's declared ``variables`` for the spec to be coherent.

Numeric ranges (min/max/step/default) are deliberately NOT part of the registry: they are
a presentation concern owned by whoever authors a spec (the fixture provider, an AI
provider, or a teacher), not part of the formula's identity.
"""

from typing import TypedDict


class FormulaVariable(TypedDict):
    id: str
    unit: str


class FormulaOutput(TypedDict):
    label: str
    unit: str


class Formula(TypedDict):
    label: str
    output: FormulaOutput
    variables: list[FormulaVariable]


# id -> Formula. Keep ids/units EXACTLY in sync with the frontend calculator.
FORMULAS: dict[str, Formula] = {
    "force_equals_mass_times_acceleration": {
        "label": "Newton's Second Law (F = m·a)",
        "output": {"label": "Force", "unit": "N"},
        "variables": [
            {"id": "mass", "unit": "kg"},
            {"id": "acceleration", "unit": "m/s²"},
        ],
    },
    "kinetic_energy": {
        "label": "Kinetic Energy (KE = ½·m·v²)",
        "output": {"label": "Energy", "unit": "J"},
        "variables": [
            {"id": "mass", "unit": "kg"},
            {"id": "velocity", "unit": "m/s"},
        ],
    },
    "momentum": {
        "label": "Momentum (p = m·v)",
        "output": {"label": "Momentum", "unit": "kg·m/s"},
        "variables": [
            {"id": "mass", "unit": "kg"},
            {"id": "velocity", "unit": "m/s"},
        ],
    },
    "ohms_law": {
        "label": "Ohm's Law (V = I·R)",
        "output": {"label": "Voltage", "unit": "V"},
        "variables": [
            {"id": "current", "unit": "A"},
            {"id": "resistance", "unit": "Ω"},
        ],
    },
    "work_done": {
        "label": "Work Done (W = F·d)",
        "output": {"label": "Work", "unit": "J"},
        "variables": [
            {"id": "force", "unit": "N"},
            {"id": "distance", "unit": "m"},
        ],
    },
}


def get_formula(formula_id: str | None) -> Formula | None:
    """Return the registry entry for ``formula_id``, or ``None`` if it is unknown."""
    if formula_id is None:
        return None
    return FORMULAS.get(formula_id)


def required_variable_ids(formula_id: str) -> set[str]:
    """Return the set of variable ids a spec must declare for ``formula_id``.

    Raises ``KeyError`` for an unknown formula — callers that may receive untrusted ids
    should gate on :func:`get_formula` first.
    """
    return {variable["id"] for variable in FORMULAS[formula_id]["variables"]}


def missing_required_variables(formula_id: str, declared_variable_ids: set[str]) -> set[str]:
    """Return required variable ids that ``declared_variable_ids`` fails to cover.

    An empty set means the declared variables are coherent with the formula (they cover
    every input the formula needs). A spec may declare *extra* variables — only missing
    required inputs make it incoherent.
    """
    return required_variable_ids(formula_id) - declared_variable_ids
