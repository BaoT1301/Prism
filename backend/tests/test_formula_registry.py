"""Multi-formula support for the parameter_explorer sandbox.

Covers the formula registry, the fixture provider's ability to emit a valid spec for every
canonical formula, F = ma backward compatibility end to end, and the two coherence
rejections (unknown formula, formula whose required inputs are not covered).
"""

import pytest

from app.core.errors import ApiError
from app.models.models import Assignment, InterestProfile, Profile, UserRole
from app.schemas.domain import AssignmentCreate, ClassCreate, InterestsRequest
from app.services.domain import DomainService
from app.services.formulas import FORMULAS, get_formula, missing_required_variables, required_variable_ids
from app.services.personalization import FixturePersonalizationProvider, PersonalizationService

# Canonical formula set (kept in lockstep with the frontend calculator and the JSON-Schema
# enum). Each row: formula id + an assignment topic/objective that should select it.
FORMULA_CASES = [
    ("force_equals_mass_times_acceleration", "Force and Newton's Second Law", "Apply F = ma."),
    ("kinetic_energy", "Kinetic Energy of Moving Objects", "Explain kinetic energy."),
    ("momentum", "Momentum and Collisions", "Explain momentum."),
    ("ohms_law", "Ohm's Law in Circuits", "Apply Ohm's Law."),
    ("work_done", "Work Done on an Object", "Explain the work done."),
]


def _assignment(topic: str, objective: str) -> Assignment:
    """A transient (unpersisted) assignment — generate()/validate() never touch the DB."""
    return Assignment(title=topic, topic=topic, learning_objective=objective)


def _interests(**overrides: list[str]) -> InterestProfile:
    fields = {key: [] for key in ("sports", "games", "movies", "hobbies", "career_interests", "favorite_animals", "favorite_subjects", "additional_interests")}
    fields.update(overrides)
    return InterestProfile(**fields)


def test_registry_covers_canonical_set_and_flags_gaps():
    assert set(FORMULAS) == {formula_id for formula_id, *_ in FORMULA_CASES}
    # Every entry exposes an output (label+unit) and at least the required input variables.
    for formula in FORMULAS.values():
        assert set(formula["output"]) == {"label", "unit"}
        assert len(formula["variables"]) >= 2
        assert all(set(variable) == {"id", "unit"} for variable in formula["variables"])
    assert get_formula("teleportation") is None
    assert missing_required_variables("ohms_law", {"current"}) == {"resistance"}
    assert missing_required_variables("ohms_law", {"current", "resistance"}) == set()
    # Extra declared variables are allowed; only missing required inputs are incoherent.
    assert missing_required_variables("momentum", {"mass", "velocity", "acceleration"}) == set()


@pytest.mark.parametrize("formula_id,topic,objective", FORMULA_CASES)
def test_fixture_produces_valid_validate_passing_spec_for_each_formula(formula_id, topic, objective):
    assignment = _assignment(topic, objective)
    provider = FixturePersonalizationProvider()
    content = provider.generate(assignment, _interests(sports=["basketball"]))

    spec = content.sandbox_spec
    assert spec["formula_id"] == formula_id
    assert spec["sandbox_type"] == "parameter_explorer"
    declared = {variable["id"] for variable in spec["variables"]}
    assert required_variable_ids(formula_id) <= declared
    # validate() runs objective-invariant + JSON schema + formula coherence + reflection
    # cross-check + markup screen. No exception means all of them passed.
    PersonalizationService(provider).validate(assignment, content)


def test_fma_backward_compatible_end_to_end(prism_db):
    db, teacher, student = prism_db
    domain = DomainService()
    classroom = domain.create_class(db, teacher, ClassCreate(name="Physics", subject="Physics", grade_level="10"))
    domain.join_class(db, student, classroom.join_code)
    assignment = domain.create_assignment(db, classroom.id, teacher, AssignmentCreate(title="Force", topic="Force", learning_objective="Apply F = ma.", grade_level="10", sandbox_type="parameter_explorer"))
    domain.publish_assignment(db, assignment.id, teacher)
    interests = domain.save_interests(db, student, InterestsRequest(sports=["basketball"]))

    generated, session, cache = PersonalizationService(FixturePersonalizationProvider()).start(db, assignment, student, interests)

    assert cache == "miss"
    assert generated.status.value == "completed"
    assert generated.sandbox_spec["formula_id"] == "force_equals_mass_times_acceleration"
    assert generated.sandbox_spec["sandbox_type"] == "parameter_explorer"
    assert {step["id"] for step in generated.sandbox_spec["guided_steps"]} == {"set-mass", "set-acceleration", "explain-force"}
    assert session.student_id == student.id


def test_unknown_formula_id_is_rejected():
    assignment = _assignment("Force", "Apply F = ma.")
    provider = FixturePersonalizationProvider()
    content = provider.generate(assignment, _interests(sports=["basketball"]))
    poisoned = content.model_copy(update={"sandbox_spec": {**content.sandbox_spec, "formula_id": "teleportation"}})
    with pytest.raises(ApiError) as error:
        PersonalizationService(provider).validate(assignment, poisoned)
    assert error.value.detail["code"] == "INVALID_AI_OUTPUT"


def test_formula_missing_required_variable_is_rejected():
    assignment = _assignment("Force", "Apply F = ma.")
    provider = FixturePersonalizationProvider()
    content = provider.generate(assignment, _interests(sports=["basketball"]))
    # Swap the required 'acceleration' input for a non-required 'velocity' slider: the spec
    # still has two well-formed variables (schema passes) but no longer covers F = ma's
    # inputs, so the registry coherence check must reject it.
    kept = [variable for variable in content.sandbox_spec["variables"] if variable["id"] != "acceleration"]
    kept.append({"id": "velocity", "label": "Velocity", "unit": "m/s", "min": 0, "max": 30, "step": 0.5, "default": 10, "editable": True})
    poisoned = content.model_copy(update={"sandbox_spec": {**content.sandbox_spec, "variables": kept}})
    with pytest.raises(ApiError) as error:
        PersonalizationService(provider).validate(assignment, poisoned)
    assert error.value.detail["code"] == "INVALID_AI_OUTPUT"


@pytest.fixture
def prism_db(client):
    _, session_factory = client
    db = session_factory()
    teacher = Profile(auth_user_id="user_formula_teacher", email="teacher@formula.test", display_name="Teacher", role=UserRole.TEACHER)
    student = Profile(auth_user_id="user_formula_student", email="student@formula.test", display_name="Student", role=UserRole.STUDENT)
    db.add_all([teacher, student])
    db.commit()
    yield db, teacher, student
    db.close()
