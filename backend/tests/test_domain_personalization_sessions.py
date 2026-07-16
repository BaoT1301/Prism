import uuid

import pytest

from app.api.routes.sessions import hint, owned_session, submit, update_progress
from app.core.errors import ApiError
from app.models.models import AssignmentStatus, Profile, UserRole
from app.schemas.domain import AssignmentCreate, AssignmentUpdate, ClassCreate, InterestsRequest
from app.schemas.personalization import GeneratedContent
from app.schemas.sessions import HintRequest, ProgressRequest, SubmitRequest
from app.services.domain import DomainService
from app.services.personalization import FixturePersonalizationProvider, PersonalizationService
from app.services.sandbox import automatic_step_ids, build_progressive_hint


@pytest.fixture
def domain_db(client):
    _, session_factory = client
    db = session_factory()
    teacher = Profile(auth_user_id=uuid.uuid4(), email="teacher@school.test", display_name="Teacher", role=UserRole.TEACHER)
    student = Profile(auth_user_id=uuid.uuid4(), email="student@school.test", display_name="Student", role=UserRole.STUDENT)
    other_student = Profile(auth_user_id=uuid.uuid4(), email="other@school.test", display_name="Other", role=UserRole.STUDENT)
    other_teacher = Profile(auth_user_id=uuid.uuid4(), email="other-teacher@school.test", display_name="Other Teacher", role=UserRole.TEACHER)
    db.add_all([teacher, student, other_student, other_teacher])
    db.commit()
    yield db, teacher, student, other_student, other_teacher
    db.close()


def test_class_ownership_join_and_assignment_visibility(domain_db):
    db, teacher, student, _, other_teacher = domain_db
    service = DomainService()
    classroom = service.create_class(db, teacher, ClassCreate(name="Physics", subject="Physics", grade_level="10"))
    membership, created = service.join_class(db, student, classroom.join_code)
    assert created and membership.student_id == student.id
    assert not service.join_class(db, student, classroom.join_code)[1]
    with pytest.raises(ApiError):
        service.require_owned_class(db, classroom.id, other_teacher)
    assignment = service.create_assignment(db, classroom.id, teacher, AssignmentCreate(title="Force", topic="Force", learning_objective="Apply F = ma.", grade_level="10", sandbox_type="parameter_explorer"))
    with pytest.raises(ApiError):
        service.get_assignment(db, assignment.id, student)
    service.publish_assignment(db, assignment.id, teacher)
    assert service.get_assignment(db, assignment.id, student).status == AssignmentStatus.PUBLISHED
    with pytest.raises(ApiError):
        service.update_assignment(db, assignment.id, teacher, AssignmentUpdate(title="Nope"))


def test_interest_normalization_and_versioning(domain_db):
    db, _, student, _, _ = domain_db
    service = DomainService()
    interests = service.save_interests(db, student, InterestsRequest(sports=[" Basketball ", "basketball", "", "Tennis"]))
    assert interests.sports == ["Basketball", "Tennis"] and interests.version == 1
    assert service.save_interests(db, student, InterestsRequest(sports=["Basketball", "Tennis"])).version == 1
    assert service.save_interests(db, student, InterestsRequest(sports=["Space"])).version == 2


def test_invalid_join_and_sandbox_are_rejected(domain_db):
    db, teacher, student, _, _ = domain_db
    service = DomainService()
    with pytest.raises(ApiError):
        service.join_class(db, student, "missing")
    classroom = service.create_class(db, teacher, ClassCreate(name="Physics", subject="Physics", grade_level="10"))
    with pytest.raises(ApiError):
        service.create_assignment(db, classroom.id, teacher, AssignmentCreate(title="Bad", topic="Bad", learning_objective="Learn.", grade_level="10", sandbox_type="graph_lab"))


def test_fixture_generation_is_valid_cached_and_session_safe(domain_db):
    db, teacher, student, other_student, _ = domain_db
    domain = DomainService()
    classroom = domain.create_class(db, teacher, ClassCreate(name="Physics", subject="Physics", grade_level="10"))
    domain.join_class(db, student, classroom.join_code)
    assignment = domain.create_assignment(db, classroom.id, teacher, AssignmentCreate(title="Force", topic="Force", learning_objective="Apply F = ma.", grade_level="10", sandbox_type="parameter_explorer"))
    domain.publish_assignment(db, assignment.id, teacher)
    interests = domain.save_interests(db, student, InterestsRequest(sports=["basketball"]))
    provider = PersonalizationService(FixturePersonalizationProvider())
    generated, session, cache = provider.start(db, assignment, student, interests)
    assert cache == "miss" and generated.sandbox_spec["sandbox_type"] == "parameter_explorer"
    assert provider.start(db, assignment, student, interests)[2] == "hit"
    with pytest.raises(ApiError):
        owned_session(db, session.id, other_student)


def test_objective_and_schema_invariants_are_enforced(domain_db):
    db, teacher, student, _, _ = domain_db
    assignment = AssignmentCreate(title="Force", topic="Force", learning_objective="Apply F = ma.", grade_level="10", sandbox_type="parameter_explorer")
    domain = DomainService()
    classroom = domain.create_class(db, teacher, ClassCreate(name="Physics", subject="Physics", grade_level="10"))
    item = domain.create_assignment(db, classroom.id, teacher, assignment)
    content = GeneratedContent(personalized_title="Bad", scenario="s", problem_statement="p", learning_objective="Different", instructions=["x"], sandbox_spec={})
    with pytest.raises(ApiError):
        PersonalizationService(FixturePersonalizationProvider()).validate(item, content)


def test_progress_hints_and_idempotent_submission(domain_db):
    db, teacher, student, _, _ = domain_db
    domain = DomainService()
    classroom = domain.create_class(db, teacher, ClassCreate(name="Physics", subject="Physics", grade_level="10"))
    domain.join_class(db, student, classroom.join_code)
    assignment = domain.create_assignment(db, classroom.id, teacher, AssignmentCreate(title="Force", topic="Force", learning_objective="Apply F = ma.", grade_level="10", sandbox_type="parameter_explorer"))
    domain.publish_assignment(db, assignment.id, teacher)
    interests = domain.save_interests(db, student, InterestsRequest(sports=["basketball"]))
    _, session, _ = PersonalizationService(FixturePersonalizationProvider()).start(db, assignment, student, interests)
    updated = update_progress(session.id, ProgressRequest(expected_version=1, completed_step_ids=["set-mass"], responses={"mass": 2}), db, student)
    assert updated["version"] == 2
    with pytest.raises(ApiError):
        update_progress(session.id, ProgressRequest(expected_version=1, completed_step_ids=["bad"], responses={}), db, student)
    assert hint(session.id, HintRequest(), db, student)["hint_level"] == 1
    hint(session.id, HintRequest(), db, student)
    hint(session.id, HintRequest(), db, student)
    with pytest.raises(ApiError):
        hint(session.id, HintRequest(), db, student)
    first = submit(session.id, SubmitRequest(expected_session_version=2), db, student)
    second = submit(session.id, SubmitRequest(expected_session_version=2), db, student)
    assert first["id"] == second["id"]


def test_completion_checks_and_progressive_hints(domain_db):
    db, teacher, student, _, _ = domain_db
    domain = DomainService()
    classroom = domain.create_class(db, teacher, ClassCreate(name="Physics", subject="Physics", grade_level="10"))
    domain.join_class(db, student, classroom.join_code)
    assignment = domain.create_assignment(db, classroom.id, teacher, AssignmentCreate(title="Force", topic="Force", learning_objective="Apply F = ma.", grade_level="10", sandbox_type="parameter_explorer"))
    domain.publish_assignment(db, assignment.id, teacher)
    interests = domain.save_interests(db, student, InterestsRequest(sports=["basketball"]))
    generated, _, _ = PersonalizationService(FixturePersonalizationProvider()).start(db, assignment, student, interests)
    spec = generated.sandbox_spec
    assert automatic_step_ids(spec, {"mass": 2, "acceleration": 5}) == {"set-mass"}
    hints = [build_progressive_hint(spec, {"mass": 2, "acceleration": 5}, [], level, "set-mass") for level in (1, 2, 3)]
    assert len(set(hints)) == 3
