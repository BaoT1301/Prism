import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import get_authenticated_profile, get_student, get_teacher
from app.core.errors import ApiError
from app.db.session import get_db
from app.models.models import Assignment, AssignmentStatus, Class, ClassMember, InterestProfile, Profile
from app.schemas.domain import (
    AssignmentCreate,
    AssignmentListResponse,
    AssignmentResponse,
    AssignmentUpdate,
    ClassCreate,
    ClassListResponse,
    ClassMemberListResponse,
    ClassMembershipResponse,
    ClassResponse,
    InterestProfileResponse,
    InterestsRequest,
    JoinClassRequest,
)
from app.services.domain import DomainService

router = APIRouter(tags=["domain"])
service = DomainService()


def class_data(db: Session, item: Class) -> dict:
    return {
        "id": item.id,
        "teacher_id": item.teacher_id,
        "name": item.name,
        "subject": item.subject,
        "grade_level": item.grade_level,
        "description": item.description,
        "join_code": item.join_code,
        "student_count": db.scalar(select(func.count()).select_from(ClassMember).where(ClassMember.class_id == item.id)) or 0,
        "assignment_count": db.scalar(select(func.count()).select_from(Assignment).where(Assignment.class_id == item.id)) or 0,
        "created_at": item.created_at,
    }


def assignment_data(item: Assignment) -> dict:
    return {"id": item.id, "class_id": item.class_id, "teacher_id": item.teacher_id, "title": item.title, "topic": item.topic, "learning_objective": item.learning_objective, "grade_level": item.grade_level, "instructions": item.instructions, "sandbox_type": item.sandbox_type, "status": item.status, "content_version": item.content_version, "published_at": item.published_at, "created_at": item.created_at}


@router.post("/classes", response_model=ClassResponse, status_code=status.HTTP_201_CREATED)
def create_class(data: ClassCreate, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)]):
    return class_data(db, service.create_class(db, teacher, data))


@router.get("/classes", response_model=ClassListResponse)
def list_classes(db: Annotated[Session, Depends(get_db)], profile: Annotated[Profile, Depends(get_authenticated_profile)]):
    if profile.role.value == "teacher":
        items = db.scalars(select(Class).where(Class.teacher_id == profile.id).order_by(Class.created_at.desc())).all()
    else:
        items = db.scalars(select(Class).join(ClassMember).where(ClassMember.student_id == profile.id).order_by(Class.created_at.desc())).all()
    return {"items": [class_data(db, item) for item in items], "total": len(items)}


@router.get("/classes/{class_id}", response_model=ClassResponse)
def get_class(class_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], profile: Annotated[Profile, Depends(get_authenticated_profile)]):
    return class_data(db, service.class_for_user(db, class_id, profile))


@router.delete("/classes/{class_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_class(class_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)]) -> Response:
    item = service.require_owned_class(db, class_id, teacher)
    if db.scalar(select(Assignment.id).where(Assignment.class_id == item.id)):
        raise ApiError(409, "CLASS_HAS_ASSIGNMENTS", "Classes with assignments cannot be deleted.")
    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/classes/join", response_model=ClassMembershipResponse)
def join_class(data: JoinClassRequest, response: Response, db: Annotated[Session, Depends(get_db)], student: Annotated[Profile, Depends(get_student)]):
    item, created = service.join_class(db, student, data.join_code)
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return {"class_id": item.class_id, "student_id": item.student_id, "joined_at": item.joined_at}


@router.get("/classes/{class_id}/members", response_model=ClassMemberListResponse)
def members(class_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)]):
    service.require_owned_class(db, class_id, teacher)
    items = db.execute(select(ClassMember, Profile).join(Profile, Profile.id == ClassMember.student_id).where(ClassMember.class_id == class_id)).all()
    return {"items": [{"student_id": member.student_id, "display_name": profile.display_name, "joined_at": member.joined_at} for member, profile in items], "total": len(items)}


@router.post("/classes/{class_id}/assignments", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
def create_assignment(class_id: uuid.UUID, data: AssignmentCreate, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)]):
    return assignment_data(service.create_assignment(db, class_id, teacher, data))


@router.get("/classes/{class_id}/assignments", response_model=AssignmentListResponse)
def list_assignments(class_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], profile: Annotated[Profile, Depends(get_authenticated_profile)]):
    service.class_for_user(db, class_id, profile)
    query = select(Assignment).where(Assignment.class_id == class_id)
    if profile.role.value != "teacher":
        query = query.where(Assignment.status == AssignmentStatus.PUBLISHED)
    items = db.scalars(query.order_by(Assignment.created_at.desc())).all()
    return {"items": [assignment_data(item) for item in items], "total": len(items)}


@router.get("/assignments/{assignment_id}", response_model=AssignmentResponse)
def get_assignment(assignment_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], profile: Annotated[Profile, Depends(get_authenticated_profile)]):
    return assignment_data(service.get_assignment(db, assignment_id, profile))


@router.patch("/assignments/{assignment_id}", response_model=AssignmentResponse)
def patch_assignment(assignment_id: uuid.UUID, data: AssignmentUpdate, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)]):
    return assignment_data(service.update_assignment(db, assignment_id, teacher, data))


@router.post("/assignments/{assignment_id}/publish", response_model=AssignmentResponse)
def publish_assignment(assignment_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)]):
    return assignment_data(service.publish_assignment(db, assignment_id, teacher))


@router.get("/me/interests", response_model=InterestProfileResponse)
def get_interests(db: Annotated[Session, Depends(get_db)], student: Annotated[Profile, Depends(get_student)]):
    item = db.scalar(select(InterestProfile).where(InterestProfile.student_id == student.id))
    if item is None:
        raise ApiError(404, "INTEREST_PROFILE_NOT_FOUND", "Interest profile was not found.")
    return item


@router.put("/me/interests", response_model=InterestProfileResponse)
def put_interests(data: InterestsRequest, db: Annotated[Session, Depends(get_db)], student: Annotated[Profile, Depends(get_student)]):
    return service.save_interests(db, student, data)
