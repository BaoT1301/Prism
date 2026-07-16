import uuid
from datetime import datetime, UTC
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.dependencies.auth import get_student, get_teacher
from app.core.errors import ApiError
from app.db.session import get_db
from app.models.models import Assignment, GeneratedAssignment, Profile, SandboxSession, SandboxSessionStatus, Submission
from app.schemas.sessions import HintRequest, ProgressRequest, SubmitRequest
from app.services.sandbox import automatic_step_ids, build_progressive_hint

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
    return {"id": item.id, "version": item.version, "status": item.status, "completed_step_ids": item.completed_step_ids, "responses": item.responses, "hints_used": item.hints_used, "updated_at": item.updated_at}


@router.get("/sandbox-sessions/{session_id}")
def get_session(session_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], student: Annotated[Profile, Depends(get_student)]):
    return session_data(owned_session(db, session_id, student)[0])


@router.patch("/sandbox-sessions/{session_id}/progress")
def update_progress(session_id: uuid.UUID, data: ProgressRequest, db: Annotated[Session, Depends(get_db)], student: Annotated[Profile, Depends(get_student)]):
    item, generated = owned_session(db, session_id, student)
    spec = generated.sandbox_spec or {}
    valid_steps = {step["id"] for step in spec.get("guided_steps", [])}
    valid_variables = {variable["id"]: variable for variable in spec.get("variables", [])}
    if not set(data.completed_step_ids).issubset(valid_steps):
        raise ApiError(422, "INVALID_STEP_ID", "Completed steps must be in the sandbox specification.")
    completed_step_ids = sorted(set(data.completed_step_ids) | automatic_step_ids(spec, data.responses))
    for key, value in data.responses.items():
        variable = valid_variables.get(key)
        if variable is None or not isinstance(value, (int, float)) or not variable["min"] <= value <= variable["max"]:
            raise ApiError(422, "INVALID_RESPONSE", "Responses must match configured variable ranges.")
    result = db.execute(update(SandboxSession).where(SandboxSession.id == item.id, SandboxSession.version == data.expected_version).values(completed_step_ids=completed_step_ids, responses=data.responses, progress={"completed_step_ids": completed_step_ids, "responses": data.responses}, version=SandboxSession.version + 1))
    if result.rowcount != 1:
        db.rollback()
        raise ApiError(409, "SESSION_VERSION_CONFLICT", "The sandbox session was updated by another request.")
    db.commit()
    db.refresh(item)
    return session_data(item)


@router.post("/sandbox-sessions/{session_id}/hint")
def hint(session_id: uuid.UUID, data: HintRequest, db: Annotated[Session, Depends(get_db)], student: Annotated[Profile, Depends(get_student)]):
    item, generated = owned_session(db, session_id, student)
    if item.hints_used >= 3:
        raise ApiError(429, "HINT_LIMIT_REACHED", "No more hints are available for this session.")
    item.hints_used += 1
    db.commit()
    db.refresh(item)
    return {"hint_level": item.hints_used, "hint": build_progressive_hint(generated.sandbox_spec or {}, item.responses, item.completed_step_ids, item.hints_used, data.current_step_id), "remaining_hint_levels": 3 - item.hints_used}


@router.post("/sandbox-sessions/{session_id}/submit", status_code=status.HTTP_201_CREATED)
def submit(session_id: uuid.UUID, data: SubmitRequest, db: Annotated[Session, Depends(get_db)], student: Annotated[Profile, Depends(get_student)]):
    item, generated = owned_session(db, session_id, student)
    existing = db.scalar(select(Submission).where(Submission.session_id == item.id))
    if existing:
        return {"id": existing.id, "assignment_id": existing.assignment_id, "student_id": existing.student_id, "status": "submitted", "submitted_at": existing.submitted_at}
    if item.version != data.expected_session_version:
        raise ApiError(409, "SESSION_VERSION_CONFLICT", "The sandbox session was updated by another request.")
    submission = Submission(assignment_id=generated.assignment_id, generated_assignment_id=generated.id, session_id=item.id, student_id=student.id, responses_snapshot=item.responses, reflection_answers=data.reflection_answers)
    item.status = SandboxSessionStatus.SUBMITTED
    item.submitted_at = datetime.now(UTC)
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return {"id": submission.id, "assignment_id": submission.assignment_id, "student_id": submission.student_id, "status": "submitted", "submitted_at": submission.submitted_at}


@router.get("/assignments/{assignment_id}/submissions")
def submissions(assignment_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)]):
    assignment = db.get(Assignment, assignment_id)
    if assignment is None or assignment.teacher_id != teacher.id:
        raise ApiError(404, "ASSIGNMENT_NOT_FOUND", "The requested assignment was not found.")
    rows = db.execute(select(Submission, Profile).join(Profile, Profile.id == Submission.student_id).where(Submission.assignment_id == assignment_id)).all()
    return {"items": [{"submission_id": item.id, "student_id": item.student_id, "student_name": profile.display_name, "status": "submitted", "submitted_at": item.submitted_at} for item, profile in rows], "total": len(rows)}
