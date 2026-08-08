"""Regression tests for the feature/prism-v2 platform & lifecycle features.

Covers: class management (rename / archive-list-exclusion / join-code regeneration /
member removal, non-owner 404s), GDPR account soft-delete + anonymize + auth lockout,
per-student generation status, and the actor-scoped audit log.
"""
import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.api.routes.domain import (
    archive_class,
    generation_status,
    list_classes,
    regenerate_join_code,
    remove_member,
    unarchive_class,
    update_class,
)
from app.api.routes.profiles import my_audit
from app.api.routes.sessions import upsert_review
from app.core.errors import ApiError
from app.models.models import (
    AuditEvent,
    ClassMember,
    GeneratedAssignment,
    GenerationStatus,
    Profile,
    SandboxSession,
    Submission,
    UserRole,
)
from app.schemas.domain import AssignmentCreate, ClassCreate, ClassUpdate, InterestsRequest
from app.schemas.sessions import ReviewRequest
from app.services.domain import _JOIN_CODE_ALPHABET, DomainService
from app.services.jwt import AuthClaims
from app.services.profiles import ProfileService


def auth(token: str = "valid") -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def platform_db(client):
    _, session_factory = client
    db = session_factory()
    teacher = Profile(auth_user_id="user_pl_teacher", email="t@pl.test", display_name="Teacher", role=UserRole.TEACHER)
    other_teacher = Profile(auth_user_id="user_pl_other_teacher", email="ot@pl.test", display_name="Other Teacher", role=UserRole.TEACHER)
    student = Profile(auth_user_id="user_pl_student", email="s@pl.test", display_name="Student", role=UserRole.STUDENT)
    other_student = Profile(auth_user_id="user_pl_other_student", email="os@pl.test", display_name="Other", role=UserRole.STUDENT)
    db.add_all([teacher, other_teacher, student, other_student])
    db.commit()
    yield db, teacher, other_teacher, student, other_student
    db.close()


def _published_assignment(db, domain, teacher, student, *, title="Force"):
    classroom = domain.create_class(db, teacher, ClassCreate(name="Physics", subject="Physics", grade_level="10"))
    domain.join_class(db, student, classroom.join_code)
    assignment = domain.create_assignment(db, classroom.id, teacher, AssignmentCreate(title=title, topic="Force", learning_objective="Apply F = ma.", grade_level="10", sandbox_type="parameter_explorer"))
    domain.publish_assignment(db, assignment.id, teacher)
    return classroom, assignment


# --- Feature 1: class management -----------------------------------------------------


def test_update_class_partial_rename_and_clear_description(platform_db):
    db, teacher, other_teacher, *_ = platform_db
    domain = DomainService()
    classroom = domain.create_class(db, teacher, ClassCreate(name="Physics", subject="Physics", grade_level="10", description="old"))

    renamed = update_class(classroom.id, ClassUpdate(name="Advanced Physics"), db, teacher)
    assert renamed["name"] == "Advanced Physics"
    assert renamed["description"] == "old"  # unset field untouched

    cleared = update_class(classroom.id, ClassUpdate(description=None), db, teacher)
    assert cleared["description"] is None
    assert cleared["name"] == "Advanced Physics"  # prior rename preserved

    with pytest.raises(ApiError) as error:
        update_class(classroom.id, ClassUpdate(name="Hijack"), db, other_teacher)
    assert error.value.detail["code"] == "CLASS_NOT_FOUND"


def test_archive_excludes_from_default_list_and_include_archived_shows_it(platform_db):
    db, teacher, *_ = platform_db
    domain = DomainService()
    active = domain.create_class(db, teacher, ClassCreate(name="Active", subject="Physics", grade_level="10"))
    archived = domain.create_class(db, teacher, ClassCreate(name="Archived", subject="Physics", grade_level="10"))

    result = archive_class(archived.id, db, teacher)
    assert result["archived_at"] is not None

    default = list_classes(db, teacher)
    assert {item["id"] for item in default["items"]} == {active.id}
    assert default["total"] == 1

    with_archived = list_classes(db, teacher, include_archived=True)
    assert {item["id"] for item in with_archived["items"]} == {active.id, archived.id}
    assert with_archived["total"] == 2

    restored = unarchive_class(archived.id, db, teacher)
    assert restored["archived_at"] is None
    assert list_classes(db, teacher)["total"] == 2


def test_regenerate_join_code_changes_and_remains_unique_and_joinable(platform_db):
    db, teacher, _ot, student, _os = platform_db
    domain = DomainService()
    classroom = domain.create_class(db, teacher, ClassCreate(name="Physics", subject="Physics", grade_level="10"))
    original = classroom.join_code

    new_code = regenerate_join_code(classroom.id, db, teacher)["join_code"]
    assert new_code != original
    assert set(new_code) <= set(_JOIN_CODE_ALPHABET)

    # Old code no longer resolves; the fresh code enrolls the student.
    with pytest.raises(ApiError):
        domain.join_class(db, student, original)
    membership, created = domain.join_class(db, student, new_code)
    assert created and membership.student_id == student.id

    # The regenerated code stays globally unique against other classes' codes.
    other = domain.create_class(db, teacher, ClassCreate(name="Chem", subject="Chemistry", grade_level="10"))
    assert other.join_code != new_code


def test_remove_member_deletes_membership_and_is_owner_scoped(platform_db):
    db, teacher, other_teacher, student, _os = platform_db
    domain = DomainService()
    classroom = domain.create_class(db, teacher, ClassCreate(name="Physics", subject="Physics", grade_level="10"))
    domain.join_class(db, student, classroom.join_code)

    def member_count() -> int:
        return db.scalar(select(func.count()).select_from(ClassMember).where(ClassMember.class_id == classroom.id))

    assert member_count() == 1
    remove_member(classroom.id, student.id, db, teacher)
    assert member_count() == 0

    # Removing a non-member 404s.
    with pytest.raises(ApiError) as error:
        remove_member(classroom.id, student.id, db, teacher)
    assert error.value.detail["code"] == "CLASS_MEMBER_NOT_FOUND"

    # A non-owning teacher cannot remove members (ownership 404 wins over member lookup).
    domain.join_class(db, student, classroom.join_code)
    with pytest.raises(ApiError) as error:
        remove_member(classroom.id, student.id, db, other_teacher)
    assert error.value.detail["code"] == "CLASS_NOT_FOUND"


def test_class_management_requires_owner(platform_db):
    db, teacher, other_teacher, *_ = platform_db
    domain = DomainService()
    classroom = domain.create_class(db, teacher, ClassCreate(name="Physics", subject="Physics", grade_level="10"))
    for call in (
        lambda: update_class(classroom.id, ClassUpdate(name="x"), db, other_teacher),
        lambda: archive_class(classroom.id, db, other_teacher),
        lambda: unarchive_class(classroom.id, db, other_teacher),
        lambda: regenerate_join_code(classroom.id, db, other_teacher),
        lambda: remove_member(classroom.id, uuid.uuid4(), db, other_teacher),
    ):
        with pytest.raises(ApiError) as error:
            call()
        assert error.value.detail["code"] == "CLASS_NOT_FOUND"


# --- Feature 2: account lifecycle / GDPR ---------------------------------------------


def test_delete_account_anonymizes_and_records_audit(platform_db):
    db, teacher, *_ = platform_db
    service = ProfileService()
    original_email = teacher.email

    service.delete_account(db, teacher)

    assert teacher.deleted_at is not None
    assert teacher.email == f"deleted+{teacher.id}@removed.invalid"
    assert teacher.email != original_email
    assert teacher.display_name == "Deleted user"

    # require_profile now rejects the soft-deleted account via the not-provisioned path.
    claims = AuthClaims(subject=teacher.auth_user_id, email="anything@x.test")
    with pytest.raises(ApiError) as error:
        service.require_profile(db, claims)
    assert error.value.detail["code"] == "PROFILE_NOT_PROVISIONED"

    events = db.scalars(select(AuditEvent).where(AuditEvent.actor_id == teacher.id, AuditEvent.action == "account.delete")).all()
    assert len(events) == 1 and events[0].target_id == teacher.id


def test_delete_me_endpoint_soft_deletes_and_locks_out(client):
    test_client, _ = client
    assert test_client.post("/api/v1/profiles/bootstrap", headers=auth(), json={"display_name": "Bao", "role": "teacher"}).status_code == 201
    assert test_client.get("/api/v1/me", headers=auth()).status_code == 200

    deleted = test_client.delete("/api/v1/me", headers=auth())
    assert deleted.status_code == 204

    after = test_client.get("/api/v1/me", headers=auth())
    assert after.status_code == 404
    assert after.json()["error"]["code"] == "PROFILE_NOT_PROVISIONED"
    # A second delete is likewise rejected because the account can no longer authenticate.
    assert test_client.delete("/api/v1/me", headers=auth()).status_code == 404


# --- Feature 3: generation status ----------------------------------------------------


def test_generation_status_none_pending_completed_and_version_scoped(platform_db):
    db, teacher, _ot, student, _os = platform_db
    domain = DomainService()
    _, assignment = _published_assignment(db, domain, teacher, student)

    # No interest profile -> nothing can be generated.
    assert generation_status(assignment.id, db, student)["status"] == "none"

    interests = domain.save_interests(db, student, InterestsRequest(sports=["basketball"]))
    # Interests exist but no generation row for the current versions yet.
    assert generation_status(assignment.id, db, student)["status"] == "none"

    row = GeneratedAssignment(
        assignment_id=assignment.id, assignment_content_version=assignment.content_version,
        student_id=student.id, interest_profile_version=interests.version, status=GenerationStatus.PENDING,
    )
    db.add(row)
    db.commit()
    assert generation_status(assignment.id, db, student)["status"] == "pending"

    row.status = GenerationStatus.COMPLETED
    db.commit()
    assert generation_status(assignment.id, db, student)["status"] == "completed"

    # Bumping interests changes the version key, so the old generation no longer matches.
    interests_v2 = domain.save_interests(db, student, InterestsRequest(sports=["space"]))
    assert interests_v2.version == 2
    assert generation_status(assignment.id, db, student)["status"] == "none"


def test_generation_status_non_member_and_hidden_draft_404(platform_db):
    db, teacher, _ot, student, other_student = platform_db
    domain = DomainService()
    classroom, assignment = _published_assignment(db, domain, teacher, student)

    # A student who is not a member of the class gets 404 (never 403). The existing
    # class_for_user convention surfaces this as CLASS_NOT_FOUND (uniform with a class that
    # does not exist, so membership is not leaked).
    with pytest.raises(ApiError) as error:
        generation_status(assignment.id, db, other_student)
    assert error.value.status_code == 404
    assert error.value.detail["code"] == "CLASS_NOT_FOUND"

    # Unknown assignment id.
    with pytest.raises(ApiError) as error:
        generation_status(uuid.uuid4(), db, student)
    assert error.value.detail["code"] == "ASSIGNMENT_NOT_FOUND"

    # A member cannot see a draft assignment (student visibility rule -> 404).
    draft = domain.create_assignment(db, classroom.id, teacher, AssignmentCreate(title="Draft", topic="X", learning_objective="Y.", grade_level="10", sandbox_type="parameter_explorer"))
    with pytest.raises(ApiError) as error:
        generation_status(draft.id, db, student)
    assert error.value.detail["code"] == "ASSIGNMENT_NOT_FOUND"


# --- Feature 4: audit log ------------------------------------------------------------


def test_audit_events_recorded_for_lifecycle_actions_and_scoped(platform_db):
    db, teacher, other_teacher, student, _os = platform_db
    domain = DomainService()
    classroom, assignment = _published_assignment(db, domain, teacher, student)  # publish -> assignment.publish
    domain.archive_class(db, classroom.id, teacher)                              # class.archive
    domain.unarchive_class(db, classroom.id, teacher)                            # class.unarchive
    domain.remove_member(db, classroom.id, student.id, teacher)                  # class.member_remove

    feed = my_audit(teacher, db)
    by_action = {item.action: item for item in feed["items"]}
    assert set(by_action) == {"assignment.publish", "class.archive", "class.unarchive", "class.member_remove"}
    assert feed["total"] == 4
    assert by_action["assignment.publish"].target_type == "assignment"
    assert by_action["assignment.publish"].target_id == assignment.id
    assert by_action["class.archive"].target_id == classroom.id
    assert by_action["class.member_remove"].target_type == "profile"
    assert by_action["class.member_remove"].target_id == student.id

    # Every recorded event belongs to the acting teacher; another teacher's feed is empty.
    assert all(item.actor_id == teacher.id for item in feed["items"])
    assert my_audit(other_teacher, db)["total"] == 0


def test_review_upsert_records_a_single_audit_event(platform_db):
    db, teacher, _ot, student, _os = platform_db
    domain = DomainService()
    _, assignment = _published_assignment(db, domain, teacher, student)
    generated = GeneratedAssignment(assignment_id=assignment.id, assignment_content_version=1, student_id=student.id, interest_profile_version=1, status=GenerationStatus.COMPLETED, reflection_questions=[], sandbox_spec={})
    db.add(generated)
    db.commit()
    session = SandboxSession(generated_assignment_id=generated.id, student_id=student.id)
    db.add(session)
    db.commit()
    submission = Submission(assignment_id=assignment.id, generated_assignment_id=generated.id, session_id=session.id, student_id=student.id, responses_snapshot={}, reflection_answers=[])
    db.add(submission)
    db.commit()

    upsert_review(submission.id, ReviewRequest(score=90, feedback="Great."), db, teacher)
    # A second upsert must not create a second audit row per action... it records once more,
    # but each call is one event; assert the first call produced exactly one event.
    events = db.scalars(select(AuditEvent).where(AuditEvent.action == "review.upsert", AuditEvent.actor_id == teacher.id)).all()
    assert len(events) == 1
    assert events[0].target_type == "submission"
    assert events[0].target_id == submission.id


def test_my_audit_is_paginated_newest_first(platform_db):
    db, teacher, other_teacher, *_ = platform_db
    base = datetime(2024, 1, 1, 12, 0, 0)
    for index, action in enumerate(("audit.one", "audit.two", "audit.three")):
        db.add(AuditEvent(actor_id=teacher.id, action=action, target_type="test", created_at=base + timedelta(minutes=index)))
    db.add(AuditEvent(actor_id=other_teacher.id, action="audit.other", target_type="test", created_at=base + timedelta(minutes=5)))
    db.commit()

    feed = my_audit(teacher, db)
    assert [item.action for item in feed["items"]] == ["audit.three", "audit.two", "audit.one"]
    assert feed["total"] == 3

    page = my_audit(teacher, db, limit=1, offset=1)
    assert [item.action for item in page["items"]] == ["audit.two"]
    assert page["total"] == 3  # total reflects the full scoped set, not the page


def test_me_audit_endpoint_serializes_recorded_events(client):
    test_client, _ = client
    assert test_client.post("/api/v1/profiles/bootstrap", headers=auth(), json={"display_name": "Bao", "role": "teacher"}).status_code == 201
    created = test_client.post("/api/v1/classes", headers=auth(), json={"name": "Physics", "subject": "Physics", "grade_level": "10"})
    class_id = created.json()["id"]
    assignment = test_client.post(f"/api/v1/classes/{class_id}/assignments", headers=auth(), json={"title": "Force", "topic": "Forces", "learning_objective": "Apply F = ma.", "grade_level": "10", "sandbox_type": "parameter_explorer"})
    assignment_id = assignment.json()["id"]
    assert test_client.post(f"/api/v1/assignments/{assignment_id}/publish", headers=auth()).status_code == 200
    assert test_client.post(f"/api/v1/classes/{class_id}/archive", headers=auth()).status_code == 200

    response = test_client.get("/api/v1/me/audit", headers=auth())
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    actions = {item["action"] for item in body["items"]}
    assert actions == {"assignment.publish", "class.archive"}
    publish = next(item for item in body["items"] if item["action"] == "assignment.publish")
    assert publish["target_type"] == "assignment"
    assert publish["target_id"] == assignment_id
    assert set(publish) == {"id", "action", "target_type", "target_id", "created_at"}
