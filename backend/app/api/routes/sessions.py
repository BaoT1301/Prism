import uuid
from datetime import datetime, UTC
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.dependencies.auth import get_student, get_teacher
from app.core.errors import ApiError
from app.core.config import get_settings
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
)
from app.schemas.sessions import (
    HintRequest,
    HintResponse,
    AssignmentProgressListResponse,
    ProgressRequest,
    SandboxSessionResponse,
    SubmissionListResponse,
    SubmissionResponse,
    SubmitRequest,
)
from app.services.sandbox import automatic_step_ids, submission_ready
from app.services.feedback import build_adaptive_feedback
from app.services.hints import OpenAIHintProvider, fallback_hint
from app.services.mission import evaluate_mission

router = APIRouter(tags=["sessions"])


def owned_session(db: Session, session_id: uuid.UUID, student: Profile) -> tuple[SandboxSession, GeneratedAssignment]:
    item = db.get(SandboxSession, session_id)
    if item is None or item.student_id != student.id:
        raise ApiError(404, "SESSION_NOT_FOUND", "The requested sandbox session was not found.")
    generated = db.get(GeneratedAssignment, item.generated_assignment_id)
    if generated is None:
        raise ApiError(404, "SESSION_NOT_FOUND", "The requested sandbox session was not found.")
    return item, generated


def session_data(item: SandboxSession) -> dict:
    progress = item.progress or {}
    return {
        "id": item.id,
        "version": item.version,
        "status": item.status,
        "completed_step_ids": item.completed_step_ids,
        "responses": item.responses,
        "reflection_answers": progress.get("reflection_answers", []),
        "hints_used": item.hints_used,
        "submitted_at": item.submitted_at,
        "updated_at": item.updated_at,
        "mission_evaluation": progress.get("mission_evaluation"),
        "interaction_events": progress.get("interaction_events", []),
        "feedback": progress.get("feedback"),
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
    mission_evaluation = evaluate_mission(spec, data.responses)
    progress = dict(item.progress or {})
    events = list(progress.get("interaction_events", []))
    if data.experiment_event:
        event = dict(data.experiment_event)
        event.setdefault("event_type", "experiment_run")
        event["outputs"] = mission_evaluation["outputs"]
        event["mission_complete"] = mission_evaluation["complete"]
        events.append(event)
    progress.update({"completed_step_ids": completed_step_ids, "responses": data.responses, "reflection_answers": answer_data, "mission_evaluation": mission_evaluation, "interaction_events": events})
    result = db.execute(update(SandboxSession).where(SandboxSession.id == item.id, SandboxSession.version == data.expected_version).values(completed_step_ids=completed_step_ids, responses=data.responses, progress=progress, attempt_count=SandboxSession.attempt_count + (1 if data.experiment_event else 0), version=SandboxSession.version + 1))
    if result.rowcount != 1:
        db.rollback()
        raise ApiError(409, "SESSION_VERSION_CONFLICT", "The sandbox session was updated by another request.")
    db.commit()
    db.refresh(item)
    return session_data(item)


@router.post("/sandbox-sessions/{session_id}/hint", response_model=HintResponse)
def hint(session_id: uuid.UUID, data: HintRequest, db: Annotated[Session, Depends(get_db)], student: Annotated[Profile, Depends(get_student)]):
    item, generated = owned_session(db, session_id, student)
    if item.hints_used >= 3:
        raise ApiError(429, "HINT_LIMIT_REACHED", "No more hints are available for this session.")
    item.hints_used += 1
    events = list((item.progress or {}).get("interaction_events", []))
    settings = get_settings()
    hint_text = fallback_hint(generated.sandbox_spec or {}, item.responses, events, item.hints_used)
    if settings.openai_api_key and not settings.demo_mode:
        try:
            hint_text = OpenAIHintProvider(settings).generate_sync(generated.sandbox_spec or {}, item.responses, events, item.hints_used)
        except Exception:
            pass
    events.append({"event_type": "hint_requested", "recorded_at": datetime.now(UTC).isoformat(), "hint_level": item.hints_used})
    item.progress = {**(item.progress or {}), "interaction_events": events}
    db.commit()
    db.refresh(item)
    return {"hint_level": item.hints_used, "hint": hint_text, "remaining_hint_levels": 3 - item.hints_used}


@router.post("/sandbox-sessions/{session_id}/submit", response_model=SubmissionResponse, status_code=status.HTTP_201_CREATED)
def submit(session_id: uuid.UUID, data: SubmitRequest, db: Annotated[Session, Depends(get_db)], student: Annotated[Profile, Depends(get_student)]):
    item, generated = owned_session(db, session_id, student)
    existing = db.scalar(select(Submission).where(Submission.session_id == item.id))
    if existing:
        existing_session = db.get(SandboxSession, existing.session_id)
        return {"id": existing.id, "assignment_id": existing.assignment_id, "student_id": existing.student_id, "status": "submitted", "submitted_at": existing.submitted_at, "feedback": (existing_session.progress or {}).get("feedback") if existing_session else None}
    if item.version != data.expected_session_version:
        raise ApiError(409, "SESSION_VERSION_CONFLICT", "The sandbox session was updated by another request.")
    spec = generated.sandbox_spec or {}
    question_ids = {question["id"] for question in spec.get("reflection_questions", [])}
    if len({answer.question_id for answer in data.reflection_answers}) != len(data.reflection_answers) or not {answer.question_id for answer in data.reflection_answers}.issubset(question_ids):
        raise ApiError(422, "INVALID_REFLECTION_ANSWER", "Reflection answers must match sandbox questions.")
    answer_data = [answer.model_dump() for answer in data.reflection_answers]
    answer_map = {answer.question_id: answer.answer for answer in data.reflection_answers}
    completed_step_ids = sorted(set(item.completed_step_ids) | automatic_step_ids(spec, item.responses, answer_map))
    mission_evaluation = evaluate_mission(spec, item.responses)
    if not mission_evaluation["complete"] or not submission_ready(spec, set(completed_step_ids), answer_map):
        raise ApiError(409, "SANDBOX_INCOMPLETE", "Complete the required steps and reflections before submitting.")
    item.completed_step_ids = completed_step_ids
    item.progress = {**(item.progress or {}), "completed_step_ids": completed_step_ids, "responses": item.responses, "reflection_answers": answer_data, "mission_evaluation": mission_evaluation}
    submission = Submission(assignment_id=generated.assignment_id, generated_assignment_id=generated.id, session_id=item.id, student_id=student.id, responses_snapshot=item.responses, reflection_answers=answer_data)
    item.status = SandboxSessionStatus.SUBMITTED
    item.submitted_at = datetime.now(UTC)
    item.progress["feedback"] = build_adaptive_feedback(item, mission_evaluation)
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return {"id": submission.id, "assignment_id": submission.assignment_id, "student_id": submission.student_id, "status": "submitted", "submitted_at": submission.submitted_at, "feedback": item.progress.get("feedback")}


@router.get("/assignments/{assignment_id}/submissions", response_model=SubmissionListResponse)
def submissions(assignment_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)]):
    assignment = db.get(Assignment, assignment_id)
    if assignment is None or assignment.teacher_id != teacher.id:
        raise ApiError(404, "ASSIGNMENT_NOT_FOUND", "The requested assignment was not found.")
    rows = db.execute(select(Submission, Profile).join(Profile, Profile.id == Submission.student_id).where(Submission.assignment_id == assignment_id)).all()
    return {"items": [{"submission_id": item.id, "student_id": item.student_id, "student_name": profile.display_name, "status": "submitted", "submitted_at": item.submitted_at} for item, profile in rows], "total": len(rows)}


@router.get("/assignments/{assignment_id}/progress", response_model=AssignmentProgressListResponse)
def assignment_progress(assignment_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)]):
    assignment = db.get(Assignment, assignment_id)
    if assignment is None or assignment.teacher_id != teacher.id:
        raise ApiError(404, "ASSIGNMENT_NOT_FOUND", "The requested assignment was not found.")

    members = db.execute(
        select(ClassMember, Profile)
        .join(Profile, Profile.id == ClassMember.student_id)
        .where(ClassMember.class_id == assignment.class_id)
        .order_by(Profile.display_name)
    ).all()
    generated_rows = db.execute(
        select(GeneratedAssignment, SandboxSession)
        .outerjoin(SandboxSession, SandboxSession.generated_assignment_id == GeneratedAssignment.id)
        .where(
            GeneratedAssignment.assignment_id == assignment_id,
            GeneratedAssignment.status == GenerationStatus.COMPLETED,
        )
        .order_by(GeneratedAssignment.created_at.desc())
    ).all()
    sessions_by_student: dict[uuid.UUID, tuple[GeneratedAssignment, SandboxSession | None]] = {}
    for generated, session in generated_rows:
        sessions_by_student.setdefault(generated.student_id, (generated, session))
    submissions_by_student = {
        item.student_id: item
        for item in db.scalars(select(Submission).where(Submission.assignment_id == assignment_id)).all()
    }

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
            "feedback": (session.progress or {}).get("feedback") if session else None,
        })
    return {"items": items, "total": len(items)}
