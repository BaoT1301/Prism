import uuid
from datetime import datetime, UTC
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased

from app.api.dependencies.auth import get_student, get_teacher
from app.api.dependencies.rate_limit import rate_limit
from app.core.errors import ApiError
from app.db.session import get_db
from app.models.models import (
    Assignment,
    ClassMember,
    GeneratedAssignment,
    GenerationStatus,
    Profile,
    SandboxSession,
    SandboxSessionStatus,
    Submission,
    SubmissionReview,
)
from app.schemas.sessions import (
    AssignmentAnalyticsResponse,
    HintRequest,
    HintResponse,
    AssignmentProgressListResponse,
    ProgressRequest,
    ReviewRequest,
    SandboxSessionResponse,
    StudentSubmissionItem,
    SubmissionDetailResponse,
    SubmissionListResponse,
    SubmissionResponse,
    SubmissionReviewResponse,
    SubmitRequest,
)
from app.services.analytics import assignment_analytics
from app.services.audit import record_event
from app.services.sandbox import automatic_step_ids, build_progressive_hint, submission_ready

router = APIRouter(tags=["sessions"])

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200


def _page(limit: int, offset: int) -> tuple[int, int]:
    return max(1, min(limit, MAX_PAGE_SIZE)), max(0, offset)


def owned_session(db: Session, session_id: uuid.UUID, student: Profile) -> tuple[SandboxSession, GeneratedAssignment]:
    item = db.get(SandboxSession, session_id)
    if item is None or item.student_id != student.id:
        raise ApiError(404, "SESSION_NOT_FOUND", "The requested sandbox session was not found.")
    generated = db.get(GeneratedAssignment, item.generated_assignment_id)
    if generated is None:
        raise ApiError(404, "SESSION_NOT_FOUND", "The requested sandbox session was not found.")
    return item, generated


def session_data(item: SandboxSession) -> dict:
    return {
        "id": item.id,
        "version": item.version,
        "status": item.status,
        "completed_step_ids": item.completed_step_ids,
        "responses": item.responses,
        "reflection_answers": item.progress.get("reflection_answers", []),
        "hints_used": item.hints_used,
        "submitted_at": item.submitted_at,
        "updated_at": item.updated_at,
    }


@router.get("/sandbox-sessions/{session_id}", response_model=SandboxSessionResponse)
def get_session(session_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], student: Annotated[Profile, Depends(get_student)]):
    return session_data(owned_session(db, session_id, student)[0])


@router.patch("/sandbox-sessions/{session_id}/progress", response_model=SandboxSessionResponse)
def update_progress(session_id: uuid.UUID, data: ProgressRequest, db: Annotated[Session, Depends(get_db)], student: Annotated[Profile, Depends(get_student)]):
    item, generated = owned_session(db, session_id, student)
    spec = generated.sandbox_spec or {}
    valid_steps = {step["id"] for step in spec.get("guided_steps", [])}
    valid_variables = {variable["id"]: variable for variable in spec.get("variables", [])}
    if not set(data.completed_step_ids).issubset(valid_steps):
        raise ApiError(422, "INVALID_STEP_ID", "Completed steps must be in the sandbox specification.")
    answers = data.reflection_answers
    question_ids = {question["id"] for question in spec.get("reflection_questions", [])}
    if len({answer.question_id for answer in answers}) != len(answers) or not {answer.question_id for answer in answers}.issubset(question_ids):
        raise ApiError(422, "INVALID_REFLECTION_ANSWER", "Reflection answers must match sandbox questions.")
    answer_data = [answer.model_dump() for answer in answers]
    answer_map = {answer.question_id: answer.answer for answer in answers}
    completed_step_ids = sorted(set(data.completed_step_ids) | automatic_step_ids(spec, data.responses, answer_map))
    for key, value in data.responses.items():
        variable = valid_variables.get(key)
        if variable is None or not isinstance(value, (int, float)) or not variable["min"] <= value <= variable["max"]:
            raise ApiError(422, "INVALID_RESPONSE", "Responses must match configured variable ranges.")
    result = db.execute(update(SandboxSession).where(SandboxSession.id == item.id, SandboxSession.version == data.expected_version).values(completed_step_ids=completed_step_ids, responses=data.responses, progress={"completed_step_ids": completed_step_ids, "responses": data.responses, "reflection_answers": answer_data}, version=SandboxSession.version + 1, updated_at=datetime.now(UTC)))
    if result.rowcount != 1:
        db.rollback()
        raise ApiError(409, "SESSION_VERSION_CONFLICT", "The sandbox session was updated by another request.")
    db.commit()
    db.refresh(item)
    return session_data(item)


@router.post("/sandbox-sessions/{session_id}/hint", response_model=HintResponse)
def hint(session_id: uuid.UUID, data: HintRequest, db: Annotated[Session, Depends(get_db)], student: Annotated[Profile, Depends(get_student)], _rate_limit: Annotated[None, Depends(rate_limit("hint", 20, 60))] = None):
    item, generated = owned_session(db, session_id, student)
    if item.hints_used >= 3:
        raise ApiError(429, "HINT_LIMIT_REACHED", "No more hints are available for this session.")
    item.hints_used += 1
    item.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(item)
    return {"hint_level": item.hints_used, "hint": build_progressive_hint(generated.sandbox_spec or {}, item.responses, item.completed_step_ids, item.hints_used, data.current_step_id), "remaining_hint_levels": 3 - item.hints_used}


def _submission_payload(submission: Submission) -> dict:
    return {"id": submission.id, "assignment_id": submission.assignment_id, "student_id": submission.student_id, "status": "submitted", "submitted_at": submission.submitted_at}


@router.post("/sandbox-sessions/{session_id}/submit", response_model=SubmissionResponse, status_code=status.HTTP_201_CREATED)
def submit(session_id: uuid.UUID, data: SubmitRequest, db: Annotated[Session, Depends(get_db)], student: Annotated[Profile, Depends(get_student)]):
    item, generated = owned_session(db, session_id, student)
    assignment_id = generated.assignment_id
    # A student may hold more than one session for an assignment (e.g. interests changed
    # between starts). Idempotency is keyed on (assignment, student) to match the DB
    # uniqueness — not on session_id — so a second session returns the first submission
    # instead of colliding on the constraint (H3).
    existing = db.scalar(select(Submission).where(Submission.assignment_id == assignment_id, Submission.student_id == student.id))
    if existing:
        return _submission_payload(existing)
    if item.version != data.expected_session_version:
        raise ApiError(409, "SESSION_VERSION_CONFLICT", "The sandbox session was updated by another request.")
    spec = generated.sandbox_spec or {}
    question_ids = {question["id"] for question in spec.get("reflection_questions", [])}
    if len({answer.question_id for answer in data.reflection_answers}) != len(data.reflection_answers) or not {answer.question_id for answer in data.reflection_answers}.issubset(question_ids):
        raise ApiError(422, "INVALID_REFLECTION_ANSWER", "Reflection answers must match sandbox questions.")
    answer_data = [answer.model_dump() for answer in data.reflection_answers]
    answer_map = {answer.question_id: answer.answer for answer in data.reflection_answers}
    completed_step_ids = sorted(set(item.completed_step_ids) | automatic_step_ids(spec, item.responses, answer_map))
    if not submission_ready(spec, set(completed_step_ids), answer_map):
        raise ApiError(409, "SANDBOX_INCOMPLETE", "Complete the required steps and reflections before submitting.")
    item.completed_step_ids = completed_step_ids
    item.progress = {"completed_step_ids": completed_step_ids, "responses": item.responses, "reflection_answers": answer_data}
    submission = Submission(assignment_id=assignment_id, generated_assignment_id=generated.id, session_id=item.id, student_id=student.id, responses_snapshot=item.responses, reflection_answers=answer_data)
    item.status = SandboxSessionStatus.SUBMITTED
    item.submitted_at = datetime.now(UTC)
    item.updated_at = datetime.now(UTC)
    db.add(submission)
    try:
        db.commit()
    except IntegrityError:
        # A concurrent submit (same session) or a sibling session for the same assignment
        # won the race and already recorded the submission — return it idempotently rather
        # than surfacing a 500 (H3).
        db.rollback()
        winner = db.scalar(select(Submission).where(Submission.assignment_id == assignment_id, Submission.student_id == student.id))
        if winner is None:
            raise
        return _submission_payload(winner)
    db.refresh(submission)
    return _submission_payload(submission)


@router.get("/assignments/{assignment_id}/submissions", response_model=SubmissionListResponse)
def submissions(assignment_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)], limit: int = DEFAULT_PAGE_SIZE, offset: int = 0):
    limit, offset = _page(limit, offset)
    assignment = db.get(Assignment, assignment_id)
    if assignment is None or assignment.teacher_id != teacher.id:
        raise ApiError(404, "ASSIGNMENT_NOT_FOUND", "The requested assignment was not found.")
    total = db.scalar(select(func.count()).select_from(Submission).where(Submission.assignment_id == assignment_id)) or 0
    reviewer = aliased(Profile)
    rows = db.execute(
        select(Submission, Profile, SubmissionReview, reviewer)
        .join(Profile, Profile.id == Submission.student_id)
        .outerjoin(SubmissionReview, SubmissionReview.submission_id == Submission.id)
        .outerjoin(reviewer, reviewer.id == SubmissionReview.reviewer_id)
        .where(Submission.assignment_id == assignment_id)
        .order_by(Submission.submitted_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    items = [
        {
            "submission_id": item.id,
            "student_id": item.student_id,
            "student_name": profile.display_name,
            "status": "submitted",
            "submitted_at": item.submitted_at,
            "review": _review_payload(review, reviewer_profile.display_name if reviewer_profile else "") if review is not None else None,
        }
        for item, profile, review, reviewer_profile in rows
    ]
    return {"items": items, "total": total}


@router.get("/assignments/{assignment_id}/progress", response_model=AssignmentProgressListResponse)
def assignment_progress(assignment_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)], limit: int = DEFAULT_PAGE_SIZE, offset: int = 0):
    limit, offset = _page(limit, offset)
    assignment = db.get(Assignment, assignment_id)
    if assignment is None or assignment.teacher_id != teacher.id:
        raise ApiError(404, "ASSIGNMENT_NOT_FOUND", "The requested assignment was not found.")

    total = db.scalar(select(func.count()).select_from(ClassMember).where(ClassMember.class_id == assignment.class_id)) or 0
    members = db.execute(
        select(ClassMember, Profile)
        .join(Profile, Profile.id == ClassMember.student_id)
        .where(ClassMember.class_id == assignment.class_id)
        .order_by(Profile.display_name)
        .limit(limit)
        .offset(offset)
    ).all()
    member_ids = [member.student_id for member, _ in members]
    generated_rows = db.execute(
        select(GeneratedAssignment, SandboxSession)
        .outerjoin(SandboxSession, SandboxSession.generated_assignment_id == GeneratedAssignment.id)
        .where(
            GeneratedAssignment.assignment_id == assignment_id,
            GeneratedAssignment.status == GenerationStatus.COMPLETED,
            GeneratedAssignment.student_id.in_(member_ids),
        )
        .order_by(GeneratedAssignment.created_at.desc())
    ).all() if member_ids else []
    sessions_by_student: dict[uuid.UUID, tuple[GeneratedAssignment, SandboxSession | None]] = {}
    for generated, session in generated_rows:
        sessions_by_student.setdefault(generated.student_id, (generated, session))
    submissions_by_student = {
        item.student_id: item
        for item in db.scalars(select(Submission).where(Submission.assignment_id == assignment_id, Submission.student_id.in_(member_ids))).all()
    } if member_ids else {}

    items = []
    for member, profile in members:
        generated, session = sessions_by_student.get(member.student_id, (None, None))
        submission = submissions_by_student.get(member.student_id)
        total_steps = len((generated.sandbox_spec or {}).get("guided_steps", [])) if generated else 0
        completed_steps = len(session.completed_step_ids) if session else 0
        items.append({
            "student_id": member.student_id,
            "student_name": profile.display_name,
            "status": "submitted" if submission else "in_progress" if generated else "not_started",
            "completed_steps": completed_steps,
            "total_steps": total_steps,
            "hints_used": session.hints_used if session else 0,
            "submitted_at": submission.submitted_at if submission else None,
        })
    return {"items": items, "total": total}


@router.get("/assignments/{assignment_id}/analytics", response_model=AssignmentAnalyticsResponse)
def analytics(assignment_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)]):
    assignment = db.get(Assignment, assignment_id)
    if assignment is None or assignment.teacher_id != teacher.id:
        raise ApiError(404, "ASSIGNMENT_NOT_FOUND", "The requested assignment was not found.")
    return assignment_analytics(db, assignment)


def _owned_submission_for_teacher(db: Session, submission_id: uuid.UUID, teacher: Profile) -> tuple[Submission, Assignment]:
    """Load a submission the caller may review, applying the 404-not-403 ownership rule."""
    submission = db.get(Submission, submission_id)
    if submission is None:
        raise ApiError(404, "SUBMISSION_NOT_FOUND", "The requested submission was not found.")
    assignment = db.get(Assignment, submission.assignment_id)
    if assignment is None or assignment.teacher_id != teacher.id:
        raise ApiError(404, "SUBMISSION_NOT_FOUND", "The requested submission was not found.")
    return submission, assignment


def _review_payload(review: SubmissionReview, reviewer_name: str) -> dict:
    return {"id": review.id, "submission_id": review.submission_id, "score": review.score, "feedback": review.feedback, "reviewer_name": reviewer_name, "reviewed_at": review.updated_at}


@router.put("/submissions/{submission_id}/review", response_model=SubmissionReviewResponse)
def upsert_review(submission_id: uuid.UUID, data: ReviewRequest, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)]):
    submission, _ = _owned_submission_for_teacher(db, submission_id, teacher)
    review = db.scalar(select(SubmissionReview).where(SubmissionReview.submission_id == submission.id))
    if review is None:
        review = SubmissionReview(submission_id=submission.id, reviewer_id=teacher.id, score=data.score, feedback=data.feedback)
        db.add(review)
        try:
            db.commit()
        except IntegrityError:
            # A concurrent first review for the same submission won the unique(submission_id)
            # race; fall through to updating the row that landed instead of raising a 500.
            db.rollback()
            review = db.scalar(select(SubmissionReview).where(SubmissionReview.submission_id == submission.id))
            review.reviewer_id, review.score, review.feedback = teacher.id, data.score, data.feedback
            db.commit()
    else:
        review.reviewer_id, review.score, review.feedback = teacher.id, data.score, data.feedback
        db.commit()
    record_event(db, teacher, "review.upsert", "submission", submission.id)
    db.commit()
    db.refresh(review)
    return _review_payload(review, teacher.display_name)


@router.get("/submissions/{submission_id}", response_model=SubmissionDetailResponse)
def submission_detail(submission_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)]):
    submission, _ = _owned_submission_for_teacher(db, submission_id, teacher)
    student = db.get(Profile, submission.student_id)
    review = db.scalar(select(SubmissionReview).where(SubmissionReview.submission_id == submission.id))
    review_payload = None
    if review is not None:
        reviewer = db.get(Profile, review.reviewer_id)
        review_payload = _review_payload(review, reviewer.display_name if reviewer else "")
    return {
        "id": submission.id,
        "assignment_id": submission.assignment_id,
        "student_id": submission.student_id,
        "student_name": student.display_name if student else "",
        "status": "submitted",
        "submitted_at": submission.submitted_at,
        "responses_snapshot": submission.responses_snapshot,
        "reflection_answers": submission.reflection_answers,
        "review": review_payload,
    }


@router.get("/me/submissions", response_model=list[StudentSubmissionItem])
def my_submissions(db: Annotated[Session, Depends(get_db)], student: Annotated[Profile, Depends(get_student)]):
    rows = db.execute(
        select(Submission, Assignment.title, SubmissionReview)
        .join(Assignment, Assignment.id == Submission.assignment_id)
        .outerjoin(SubmissionReview, SubmissionReview.submission_id == Submission.id)
        .where(Submission.student_id == student.id)
        .order_by(Submission.submitted_at.desc())
    ).all()
    items = []
    for submission, title, review in rows:
        review_payload = None
        if review is not None:
            review_payload = {"score": review.score, "feedback": review.feedback, "reviewed_at": review.updated_at}
        items.append({"assignment_id": submission.assignment_id, "assignment_title": title, "submitted_at": submission.submitted_at, "review": review_payload})
    return items
