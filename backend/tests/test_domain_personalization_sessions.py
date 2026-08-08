from datetime import UTC, datetime, timedelta

import pytest

from app.api.routes.personalization import start_assignment
from app.api.routes.sessions import assignment_progress, hint, owned_session, submit, update_progress
from app.core.errors import ApiError
from app.models.models import AssignmentStatus, GeneratedAssignment, GenerationStatus, Profile, UserRole
from app.schemas.domain import AssignmentCreate, AssignmentUpdate, ClassCreate, InterestsRequest
from app.schemas.personalization import GeneratedContent
from app.schemas.sessions import HintRequest, ProgressRequest, SubmitRequest
from app.services.domain import DomainService
from app.services.personalization import FixturePersonalizationProvider, PersonalizationService
from app.services.sandbox import automatic_step_ids, build_progressive_hint


def _published_assignment(db, teacher, student):
    """Create a published parameter-explorer assignment the student is enrolled in."""
    domain = DomainService()
    classroom = domain.create_class(db, teacher, ClassCreate(name="Physics", subject="Physics", grade_level="10"))
    domain.join_class(db, student, classroom.join_code)
    assignment = domain.create_assignment(db, classroom.id, teacher, AssignmentCreate(title="Force", topic="Force", learning_objective="Apply F = ma.", grade_level="10", sandbox_type="parameter_explorer"))
    domain.publish_assignment(db, assignment.id, teacher)
    interests = domain.save_interests(db, student, InterestsRequest(sports=["basketball"]))
    return domain, assignment, interests


def test_stale_pending_generation_is_reclaimed(domain_db):
    db, teacher, student, _, _ = domain_db
    _, assignment, interests = _published_assignment(db, teacher, student)
    # Simulate a worker that crashed mid-generation: a PENDING row whose lease has lapsed.
    db.add(GeneratedAssignment(
        assignment_id=assignment.id, assignment_content_version=assignment.content_version,
        student_id=student.id, interest_profile_version=interests.version,
        status=GenerationStatus.PENDING, pending_expires_at=datetime.now(UTC) - timedelta(minutes=10),
    ))
    db.commit()
    generated, _, cache = PersonalizationService(FixturePersonalizationProvider()).start(db, assignment, student, interests)
    assert cache == "miss"
    assert generated.status.value == "completed"


def test_fresh_pending_generation_returns_conflict(domain_db):
    db, teacher, student, _, _ = domain_db
    _, assignment, interests = _published_assignment(db, teacher, student)
    db.add(GeneratedAssignment(
        assignment_id=assignment.id, assignment_content_version=assignment.content_version,
        student_id=student.id, interest_profile_version=interests.version,
        status=GenerationStatus.PENDING, pending_expires_at=datetime.now(UTC) + timedelta(minutes=5),
    ))
    db.commit()
    with pytest.raises(ApiError) as error:
        PersonalizationService(FixturePersonalizationProvider()).start(db, assignment, student, interests)
    assert error.value.detail["code"] == "GENERATION_PENDING"


def test_concurrent_reclaim_of_failed_generation_yields_one_winner(domain_db):
    db, teacher, student, _, _ = domain_db
    _, assignment, interests = _published_assignment(db, teacher, student)
    db.add(GeneratedAssignment(
        assignment_id=assignment.id, assignment_content_version=assignment.content_version,
        student_id=student.id, interest_profile_version=interests.version,
        status=GenerationStatus.FAILED, failure_code="provider_error", failure_message="boom",
    ))
    db.commit()
    service = PersonalizationService(FixturePersonalizationProvider())
    factory = service._sessionmaker(db)
    # First racer reclaims the FAILED row (atomic UPDATE flips it to a fresh PENDING lease).
    with factory() as first:
        _, action = service._claim(first, assignment, interests, student)
    assert action == "miss"
    # Second racer must lose against the now-fresh PENDING lease rather than regenerating.
    with factory() as second, pytest.raises(ApiError) as error:
        service._claim(second, assignment, interests, student)
    assert error.value.detail["code"] == "GENERATION_PENDING"


def test_submitting_a_second_session_returns_the_existing_submission(domain_db):
    db, teacher, student, _, _ = domain_db
    domain, assignment, interests = _published_assignment(db, teacher, student)
    service = PersonalizationService(FixturePersonalizationProvider())
    _, session_a, _ = service.start(db, assignment, student, interests)
    answers = [{"question_id": "reflection-1", "answer": "Force increases."}]
    update_progress(session_a.id, ProgressRequest(expected_version=1, completed_step_ids=["set-mass"], responses={"mass": 2, "acceleration": 6}, reflection_answers=answers), db, student)
    first = submit(session_a.id, SubmitRequest(expected_session_version=2, reflection_answers=answers), db, student)

    # Changing interests bumps the interest version, producing a *new* generated assignment
    # and a second sandbox session for the same assignment.
    interests_v2 = domain.save_interests(db, student, InterestsRequest(sports=["space"]))
    assert interests_v2.version == 2
    _, session_b, _ = service.start(db, assignment, student, interests_v2)
    assert session_b.id != session_a.id

    # Submitting the second session must return the first submission idempotently, never 500
    # on the (assignment_id, student_id) uniqueness constraint (H3).
    second = submit(session_b.id, SubmitRequest(expected_session_version=1, reflection_answers=[]), db, student)
    assert second["id"] == first["id"]


def test_validate_rejects_injected_markup_in_visible_fields(domain_db):
    db, teacher, student, _, _ = domain_db
    _, assignment, interests = _published_assignment(db, teacher, student)
    service = PersonalizationService(FixturePersonalizationProvider())
    content = FixturePersonalizationProvider().generate(assignment, interests)
    poisoned = content.model_copy(update={"scenario": content.scenario + " <script>alert(1)</script>"})
    with pytest.raises(ApiError) as error:
        service.validate(assignment, poisoned)
    assert error.value.detail["code"] == "INVALID_AI_OUTPUT"


def test_validate_allows_prose_that_mentions_select_and_import(domain_db):
    db, teacher, student, _, _ = domain_db
    _, assignment, interests = _published_assignment(db, teacher, student)
    service = PersonalizationService(FixturePersonalizationProvider())
    content = FixturePersonalizationProvider().generate(assignment, interests)
    # These words tripped the old prose-hostile blocklist; the markup-based screen allows them.
    legit = content.model_copy(update={"instructions": ["Select the mass slider, then import your prior notes."]})
    service.validate(assignment, legit)


def test_progress_update_advances_updated_at(domain_db):
    db, teacher, student, _, _ = domain_db
    _, assignment, interests = _published_assignment(db, teacher, student)
    _, session, _ = PersonalizationService(FixturePersonalizationProvider()).start(db, assignment, student, interests)
    before = session.updated_at
    answers = [{"question_id": "reflection-1", "answer": "Force increases."}]
    updated = update_progress(session.id, ProgressRequest(expected_version=1, completed_step_ids=["set-mass"], responses={"mass": 2, "acceleration": 6}, reflection_answers=answers), db, student)
    assert updated["updated_at"] is not None
    assert updated["updated_at"] != before


class FailingPersonalizationProvider:
    model = "failing-provider"
    prompt_version = "test-v1"

    def generate(self, assignment, interests):
        raise RuntimeError("provider unavailable")


@pytest.fixture
def domain_db(client):
    _, session_factory = client
    db = session_factory()
    teacher = Profile(auth_user_id="user_test_teacher", email="teacher@school.test", display_name="Teacher", role=UserRole.TEACHER)
    student = Profile(auth_user_id="user_test_student", email="student@school.test", display_name="Student", role=UserRole.STUDENT)
    other_student = Profile(auth_user_id="user_test_other_student", email="other@school.test", display_name="Other", role=UserRole.STUDENT)
    other_teacher = Profile(auth_user_id="user_test_other_teacher", email="other-teacher@school.test", display_name="Other Teacher", role=UserRole.TEACHER)
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
    assert generated.reflection_questions == generated.sandbox_spec["reflection_questions"]
    assert provider.start(db, assignment, student, interests)[2] == "hit"
    with pytest.raises(ApiError):
        owned_session(db, session.id, other_student)


def test_generation_falls_back_to_validated_fixture(domain_db):
    db, teacher, student, _, _ = domain_db
    domain = DomainService()
    classroom = domain.create_class(db, teacher, ClassCreate(name="Physics", subject="Physics", grade_level="10"))
    domain.join_class(db, student, classroom.join_code)
    assignment = domain.create_assignment(db, classroom.id, teacher, AssignmentCreate(title="Force", topic="Force", learning_objective="Apply F = ma.", grade_level="10", sandbox_type="parameter_explorer"))
    domain.publish_assignment(db, assignment.id, teacher)
    interests = domain.save_interests(db, student, InterestsRequest(sports=["basketball"]))

    service = PersonalizationService(FailingPersonalizationProvider(), fallback_provider=FixturePersonalizationProvider())
    generated, session, cache = service.start(db, assignment, student, interests)

    assert cache == "miss"
    assert generated.status.value == "completed"
    assert generated.model == "fixture"
    assert generated.learning_objective == assignment.learning_objective
    assert generated.sandbox_spec["sandbox_type"] == "parameter_explorer"
    assert session.student_id == student.id


def test_start_assignment_includes_all_session_response_fields(domain_db):
    db, teacher, student, _, _ = domain_db
    domain = DomainService()
    classroom = domain.create_class(db, teacher, ClassCreate(name="Physics", subject="Physics", grade_level="10"))
    domain.join_class(db, student, classroom.join_code)
    assignment = domain.create_assignment(db, classroom.id, teacher, AssignmentCreate(title="Force", topic="Force", learning_objective="Apply F = ma.", grade_level="10", sandbox_type="parameter_explorer"))
    domain.publish_assignment(db, assignment.id, teacher)
    domain.save_interests(db, student, InterestsRequest(sports=["basketball"]))

    response = start_assignment(assignment.id, db, student, PersonalizationService(FixturePersonalizationProvider()))

    assert response["session"].submitted_at is None
    assert response["session"].status.value == "in_progress"


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
    answers = [{"question_id": "reflection-1", "answer": "Force increases."}]
    updated = update_progress(session.id, ProgressRequest(expected_version=1, completed_step_ids=["set-mass"], responses={"mass": 2, "acceleration": 6}, reflection_answers=answers), db, student)
    assert updated["version"] == 2
    assert updated["reflection_answers"] == [{"question_id": "reflection-1", "answer": "Force increases."}]
    assert "explain-force" in updated["completed_step_ids"]
    with pytest.raises(ApiError):
        update_progress(session.id, ProgressRequest(expected_version=1, completed_step_ids=["bad"], responses={}), db, student)
    with pytest.raises(ApiError):
        update_progress(session.id, ProgressRequest(expected_version=2, completed_step_ids=[], responses={}, reflection_answers=[{"question_id": "unknown", "answer": "Nope"}]), db, student)
    assert hint(session.id, HintRequest(), db, student)["hint_level"] == 1
    hint(session.id, HintRequest(), db, student)
    hint(session.id, HintRequest(), db, student)
    with pytest.raises(ApiError):
        hint(session.id, HintRequest(), db, student)
    first = submit(session.id, SubmitRequest(expected_session_version=2, reflection_answers=answers), db, student)
    second = submit(session.id, SubmitRequest(expected_session_version=2, reflection_answers=answers), db, student)
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


def test_submission_requires_declared_completion(domain_db):
    db, teacher, student, _, _ = domain_db
    domain = DomainService()
    classroom = domain.create_class(db, teacher, ClassCreate(name="Physics", subject="Physics", grade_level="10"))
    domain.join_class(db, student, classroom.join_code)
    assignment = domain.create_assignment(db, classroom.id, teacher, AssignmentCreate(title="Force", topic="Force", learning_objective="Apply F = ma.", grade_level="10", sandbox_type="parameter_explorer"))
    domain.publish_assignment(db, assignment.id, teacher)
    interests = domain.save_interests(db, student, InterestsRequest(sports=["basketball"]))
    _, session, _ = PersonalizationService(FixturePersonalizationProvider()).start(db, assignment, student, interests)
    with pytest.raises(ApiError) as error:
        submit(session.id, SubmitRequest(expected_session_version=1), db, student)
    assert error.value.detail["code"] == "SANDBOX_INCOMPLETE"


def test_teacher_assignment_progress_shows_every_member_without_grading(domain_db):
    db, teacher, student, other_student, _ = domain_db
    domain = DomainService()
    classroom = domain.create_class(db, teacher, ClassCreate(name="Physics", subject="Physics", grade_level="10"))
    domain.join_class(db, student, classroom.join_code)
    domain.join_class(db, other_student, classroom.join_code)
    assignment = domain.create_assignment(db, classroom.id, teacher, AssignmentCreate(title="Force", topic="Force", learning_objective="Apply F = ma.", grade_level="10", sandbox_type="parameter_explorer"))
    domain.publish_assignment(db, assignment.id, teacher)
    interests = domain.save_interests(db, student, InterestsRequest(sports=["basketball"]))
    _, session, _ = PersonalizationService(FixturePersonalizationProvider()).start(db, assignment, student, interests)

    initial = assignment_progress(assignment.id, db, teacher)
    initial_statuses = {item["student_id"]: item["status"] for item in initial["items"]}
    assert initial_statuses == {student.id: "in_progress", other_student.id: "not_started"}

    answers = [{"question_id": "reflection-1", "answer": "Force increases."}]
    update_progress(session.id, ProgressRequest(expected_version=1, completed_step_ids=["set-mass"], responses={"mass": 2, "acceleration": 6}, reflection_answers=answers), db, student)
    submit(session.id, SubmitRequest(expected_session_version=2, reflection_answers=answers), db, student)

    completed = assignment_progress(assignment.id, db, teacher)
    student_row = next(item for item in completed["items"] if item["student_id"] == student.id)
    assert student_row["status"] == "submitted"
    assert student_row["completed_steps"] == student_row["total_steps"] == 3
    assert student_row["hints_used"] == 0
    assert student_row["submitted_at"] is not None
