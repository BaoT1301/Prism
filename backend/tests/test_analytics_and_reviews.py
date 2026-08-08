"""Phase 2 backend: teacher analytics + grading/feedback loop.

Analytics aggregation is exercised through the route function against a hand-seeded class
(full control over hints/timestamps/answers). Grading is exercised through the route
functions for the ApiError paths, and through the HTTP layer for the dependency-enforced
role check (403) and body validation (422).
"""

import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.api.dependencies.auth import get_token_verifier
from app.api.routes.sessions import analytics, my_submissions, submission_detail, submissions, upsert_review
from app.core.errors import ApiError
from app.models.models import (
    Assignment,
    Class,
    ClassMember,
    GeneratedAssignment,
    GenerationStatus,
    Profile,
    SandboxSession,
    Submission,
    SubmissionReview,
    UserRole,
)
from app.schemas.sessions import ReviewRequest
from app.services.jwt import AuthClaims

BASE = datetime(2024, 1, 1, 10, 0, 0)  # naive on purpose: matches SQLite-stored timestamps
QUESTIONS = [{"id": "reflection-1", "question": "How did changing acceleration affect force?"}]


def _submission_for(db, assignment, student):
    return db.scalar(select(Submission).where(Submission.assignment_id == assignment.id, Submission.student_id == student.id))


@pytest.fixture
def analytics_db(client):
    """A class of 5 students: 3 submitted, 1 in-progress, 1 not-started.

    hints_used = [1, 3, 2, 0] over the four sessions; submit durations = [10, 30, 20]s;
    reflection answers group into Increases x2 / Decreases x1.
    """
    _, session_factory = client
    db = session_factory()
    teacher = Profile(auth_user_id="user_an_teacher", email="t@an.test", display_name="Teacher", role=UserRole.TEACHER)
    other_teacher = Profile(auth_user_id="user_an_other", email="o@an.test", display_name="Other Teacher", role=UserRole.TEACHER)
    db.add_all([teacher, other_teacher])
    db.commit()
    classroom = Class(teacher_id=teacher.id, name="Physics", subject="Physics", grade_level="10", join_code="ANALYT1")
    db.add(classroom)
    db.commit()
    assignment = Assignment(class_id=classroom.id, teacher_id=teacher.id, title="Force", topic="Force", learning_objective="Apply F = ma.", grade_level="10", sandbox_type="parameter_explorer")
    db.add(assignment)
    db.commit()

    students = {}
    for name in ("s1", "s2", "s3", "s4", "s5"):
        profile = Profile(auth_user_id=f"user_an_{name}", email=f"{name}@an.test", display_name=name.upper(), role=UserRole.STUDENT)
        db.add(profile)
        students[name] = profile
    db.commit()
    for profile in students.values():
        db.add(ClassMember(class_id=classroom.id, student_id=profile.id))
    db.commit()

    def generation(student):
        item = GeneratedAssignment(assignment_id=assignment.id, assignment_content_version=1, student_id=student.id, interest_profile_version=1, status=GenerationStatus.COMPLETED, reflection_questions=QUESTIONS, sandbox_spec={"guided_steps": [{"id": "a"}, {"id": "b"}]})
        db.add(item)
        db.commit()
        return item

    def session(generated, student, hints):
        item = SandboxSession(generated_assignment_id=generated.id, student_id=student.id, hints_used=hints, started_at=BASE)
        db.add(item)
        db.commit()
        return item

    def submission(generated, sandbox_session, student, seconds, answer):
        item = Submission(assignment_id=assignment.id, generated_assignment_id=generated.id, session_id=sandbox_session.id, student_id=student.id, responses_snapshot={"mass": 2}, reflection_answers=[{"question_id": "reflection-1", "answer": answer}], submitted_at=BASE + timedelta(seconds=seconds))
        db.add(item)
        db.commit()
        return item

    g1 = generation(students["s1"])
    submission(g1, session(g1, students["s1"], 1), students["s1"], 10, "Increases. Acceleration scales the force.")
    g2 = generation(students["s2"])
    submission(g2, session(g2, students["s2"], 3), students["s2"], 30, "Decreases. More mass needs more force for the same push.")
    g3 = generation(students["s3"])
    submission(g3, session(g3, students["s3"], 2), students["s3"], 20, "Increases. Force rises with a.")
    g4 = generation(students["s4"])
    session(g4, students["s4"], 0)  # in progress, never submitted
    # s5 has no generation/session at all -> not started

    yield db, teacher, other_teacher, assignment, students
    db.close()


def test_assignment_analytics_aggregates(analytics_db):
    db, teacher, _other, assignment, _students = analytics_db
    result = analytics(assignment.id, db, teacher)

    assert result["assignment_id"] == str(assignment.id)
    assert result["roster_total"] == 5
    assert result["funnel"] == {"not_started": 1, "in_progress": 1, "submitted": 3}
    assert result["completion_rate"] == 0.6
    assert result["hints"] == {"average": 1.5, "max": 3}
    assert result["median_seconds_to_submit"] == 20

    assert len(result["reflection_breakdown"]) == 1
    item = result["reflection_breakdown"][0]
    assert item["question_id"] == "reflection-1"
    assert item["prompt"] == "How did changing acceleration affect force?"
    assert item["responses"] == 3
    assert item["choices"] == [{"label": "Increases", "count": 2}, {"label": "Decreases", "count": 1}]


def test_analytics_empty_roster_is_safe(client):
    _, session_factory = client
    db = session_factory()
    teacher = Profile(auth_user_id="user_empty_teacher", email="e@an.test", display_name="Teacher", role=UserRole.TEACHER)
    db.add(teacher)
    db.commit()
    classroom = Class(teacher_id=teacher.id, name="Empty", subject="Physics", grade_level="10", join_code="EMPTY1")
    db.add(classroom)
    db.commit()
    assignment = Assignment(class_id=classroom.id, teacher_id=teacher.id, title="Force", topic="Force", learning_objective="Apply F = ma.", grade_level="10", sandbox_type="parameter_explorer")
    db.add(assignment)
    db.commit()

    result = analytics(assignment.id, db, teacher)
    assert result["roster_total"] == 0
    assert result["funnel"] == {"not_started": 0, "in_progress": 0, "submitted": 0}
    assert result["completion_rate"] == 0.0
    assert result["hints"] == {"average": 0.0, "max": 0}
    assert result["median_seconds_to_submit"] is None
    assert result["reflection_breakdown"] == []
    db.close()


def test_analytics_requires_owning_teacher(analytics_db):
    db, _teacher, other_teacher, assignment, _students = analytics_db
    with pytest.raises(ApiError) as error:
        analytics(assignment.id, db, other_teacher)
    assert error.value.detail["code"] == "ASSIGNMENT_NOT_FOUND"
    with pytest.raises(ApiError):
        analytics(uuid.uuid4(), db, other_teacher)


def test_review_upsert_creates_then_updates_single_row(analytics_db):
    db, teacher, _other, assignment, students = analytics_db
    submission = _submission_for(db, assignment, students["s1"])

    created = upsert_review(submission.id, ReviewRequest(score=80, feedback="Nice work."), db, teacher)
    assert created["submission_id"] == submission.id
    assert created["score"] == 80
    assert created["feedback"] == "Nice work."
    assert created["reviewer_name"] == teacher.display_name
    assert created["reviewed_at"] is not None

    updated = upsert_review(submission.id, ReviewRequest(score=95, feedback="Even better."), db, teacher)
    assert updated["id"] == created["id"]  # upsert, not a new row
    assert updated["score"] == 95
    assert updated["feedback"] == "Even better."

    count = db.scalar(select(func.count()).select_from(SubmissionReview).where(SubmissionReview.submission_id == submission.id))
    assert count == 1


def test_review_allows_null_score(analytics_db):
    db, teacher, _other, assignment, students = analytics_db
    submission = _submission_for(db, assignment, students["s2"])
    review = upsert_review(submission.id, ReviewRequest(score=None, feedback="Reviewed, no grade."), db, teacher)
    assert review["score"] is None
    assert review["feedback"] == "Reviewed, no grade."


def test_review_rejects_non_owning_teacher(analytics_db):
    db, _teacher, other_teacher, assignment, students = analytics_db
    submission = _submission_for(db, assignment, students["s1"])
    with pytest.raises(ApiError) as error:
        upsert_review(submission.id, ReviewRequest(score=50, feedback="x"), db, other_teacher)
    assert error.value.detail["code"] == "SUBMISSION_NOT_FOUND"
    with pytest.raises(ApiError):
        upsert_review(uuid.uuid4(), ReviewRequest(score=50, feedback="x"), db, _teacher)


def test_teacher_submission_detail_includes_snapshot_and_review(analytics_db):
    db, teacher, other_teacher, assignment, students = analytics_db
    submission = _submission_for(db, assignment, students["s1"])
    upsert_review(submission.id, ReviewRequest(score=70, feedback="ok"), db, teacher)

    detail = submission_detail(submission.id, db, teacher)
    assert detail["id"] == submission.id
    assert detail["student_name"] == students["s1"].display_name
    assert detail["responses_snapshot"] == {"mass": 2}
    assert detail["reflection_answers"][0]["question_id"] == "reflection-1"
    assert detail["review"]["score"] == 70
    assert detail["review"]["reviewer_name"] == teacher.display_name

    with pytest.raises(ApiError) as error:
        submission_detail(submission.id, db, other_teacher)
    assert error.value.detail["code"] == "SUBMISSION_NOT_FOUND"


def test_student_feed_is_owned_scoped_newest_first_with_review(analytics_db):
    db, teacher, _other, assignment, students = analytics_db
    s1, s3 = students["s1"], students["s3"]

    # Review s1's existing (Force) submission.
    force_submission = _submission_for(db, assignment, s1)
    upsert_review(force_submission.id, ReviewRequest(score=88, feedback="Great."), db, teacher)

    # A newer, still-unreviewed submission for s1 on a second assignment in the same class.
    energy = Assignment(class_id=assignment.class_id, teacher_id=teacher.id, title="Energy", topic="Energy", learning_objective="Explain KE.", grade_level="10", sandbox_type="parameter_explorer")
    db.add(energy)
    db.commit()
    generated = GeneratedAssignment(assignment_id=energy.id, assignment_content_version=1, student_id=s1.id, interest_profile_version=1, status=GenerationStatus.COMPLETED, reflection_questions=[], sandbox_spec={})
    db.add(generated)
    db.commit()
    sandbox_session = SandboxSession(generated_assignment_id=generated.id, student_id=s1.id, hints_used=0, started_at=BASE)
    db.add(sandbox_session)
    db.commit()
    db.add(Submission(assignment_id=energy.id, generated_assignment_id=generated.id, session_id=sandbox_session.id, student_id=s1.id, responses_snapshot={}, reflection_answers=[], submitted_at=BASE + timedelta(days=1)))
    db.commit()

    feed = my_submissions(db, s1)
    assert [item["assignment_title"] for item in feed] == ["Energy", "Force"]  # newest first
    assert feed[0]["review"] is None
    assert feed[1]["review"]["score"] == 88
    assert feed[1]["review"]["feedback"] == "Great."
    assert feed[1]["review"]["reviewed_at"] is not None

    # A different student sees only their own submission, never s1's.
    other_feed = my_submissions(db, s3)
    assert [item["assignment_title"] for item in other_feed] == ["Force"]
    assert all(item["assignment_id"] != energy.id for item in other_feed)


def test_submissions_list_reflects_review_state(analytics_db):
    # The teacher submissions list must show grading state (review) inline, so a
    # graded row reads as "Reviewed" without a per-row detail fetch.
    db, teacher, _other, assignment, students = analytics_db
    submission = _submission_for(db, assignment, students["s1"])
    upsert_review(submission.id, ReviewRequest(score=91, feedback="Solid."), db, teacher)

    result = submissions(assignment.id, db, teacher)
    by_student = {item["student_id"]: item for item in result["items"]}
    reviewed = by_student[students["s1"].id]
    assert reviewed["review"] is not None
    assert reviewed["review"]["score"] == 91
    assert reviewed["review"]["reviewer_name"] == teacher.display_name
    # An ungraded submission carries a null review.
    assert by_student[students["s3"].id]["review"] is None


class _MultiVerifier:
    """Maps a bearer token to a fixed subject so one TestClient can act as several users."""

    def __init__(self, mapping: dict[str, tuple[str, str]]) -> None:
        self._mapping = mapping

    def verify(self, token: str) -> AuthClaims:
        if token not in self._mapping:
            raise ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.")
        subject, email = self._mapping[token]
        return AuthClaims(subject=subject, email=email)


@pytest.fixture
def http_client(client):
    test_client, _ = client
    mapping = {"tok_teacher": ("user_http_teacher", "ht@test.test"), "tok_student": ("user_http_student", "hs@test.test")}
    test_client.app.dependency_overrides[get_token_verifier] = lambda: _MultiVerifier(mapping)
    assert test_client.post("/api/v1/profiles/bootstrap", headers={"Authorization": "Bearer tok_teacher"}, json={"display_name": "Teacher", "role": "teacher"}).status_code == 201
    assert test_client.post("/api/v1/profiles/bootstrap", headers={"Authorization": "Bearer tok_student"}, json={"display_name": "Student", "role": "student"}).status_code == 201
    return test_client


def test_student_cannot_put_review(http_client):
    # get_teacher dependency rejects a student before any route logic runs.
    response = http_client.put(f"/api/v1/submissions/{uuid.uuid4()}/review", headers={"Authorization": "Bearer tok_student"}, json={"score": 80, "feedback": "hi"})
    assert response.status_code == 403


def test_out_of_range_score_is_rejected_as_422(http_client):
    response = http_client.put(f"/api/v1/submissions/{uuid.uuid4()}/review", headers={"Authorization": "Bearer tok_teacher"}, json={"score": 150, "feedback": "hi"})
    assert response.status_code == 422
    below = http_client.put(f"/api/v1/submissions/{uuid.uuid4()}/review", headers={"Authorization": "Bearer tok_teacher"}, json={"score": -1, "feedback": "hi"})
    assert below.status_code == 422
