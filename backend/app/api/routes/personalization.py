import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import get_student
from app.core.config import get_settings
from app.core.errors import ApiError
from app.db.session import get_db
from app.models.models import Assignment, AssignmentStatus, ClassMember, InterestProfile, Profile
from app.schemas.personalization import StartResponse
from app.schemas.sessions import SandboxSessionResponse
from app.services.personalization import FixturePersonalizationProvider, OpenAIPersonalizationProvider, PersonalizationService

router = APIRouter(tags=["personalization"])


def get_service() -> PersonalizationService:
    settings = get_settings()
    fixture_provider = FixturePersonalizationProvider()
    if settings.demo_mode or not settings.openai_api_key:
        return PersonalizationService(fixture_provider)
    return PersonalizationService(OpenAIPersonalizationProvider(settings), fallback_provider=fixture_provider)


@router.post("/assignments/{assignment_id}/start", response_model=StartResponse)
def start_assignment(assignment_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], student: Annotated[Profile, Depends(get_student)], service: Annotated[PersonalizationService, Depends(get_service)]):
    assignment = db.get(Assignment, assignment_id)
    if assignment is None:
        raise ApiError(404, "ASSIGNMENT_NOT_FOUND", "The requested assignment was not found.")
    if assignment.status != AssignmentStatus.PUBLISHED:
        raise ApiError(409, "ASSIGNMENT_NOT_PUBLISHED", "This assignment is not published.")
    if not db.scalar(select(ClassMember.id).where(ClassMember.class_id == assignment.class_id, ClassMember.student_id == student.id)):
        raise ApiError(403, "NOT_A_CLASS_MEMBER", "You are not a member of this class.")
    interests = db.scalar(select(InterestProfile).where(InterestProfile.student_id == student.id))
    if interests is None:
        raise ApiError(409, "INTEREST_PROFILE_REQUIRED", "An interest profile is required.")
    generated, session, cache_status = service.start(db, assignment, student, interests)
    session_payload = SandboxSessionResponse.model_validate({
        "id": session.id,
        "version": session.version,
        "status": session.status,
        "completed_step_ids": session.completed_step_ids,
        "responses": session.responses,
        "reflection_answers": session.progress.get("reflection_answers", []),
        "hints_used": session.hints_used,
        "updated_at": session.updated_at,
    })
    return {"generated_assignment": {"id": generated.id, "assignment_id": generated.assignment_id, "student_id": generated.student_id, "personalized_title": generated.personalized_title, "scenario": generated.scenario, "problem_statement": generated.problem_statement, "learning_objective": generated.learning_objective, "instructions": generated.instructions, "reflection_questions": generated.reflection_questions, "sandbox_spec": generated.sandbox_spec, "generated_at": generated.completed_at or generated.created_at}, "cache_status": cache_status, "session": session_payload}
