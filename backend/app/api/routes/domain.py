import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import get_authenticated_profile, get_student, get_teacher
from app.api.dependencies.rate_limit import rate_limit
from app.core.errors import ApiError
from app.db.session import get_db
from app.models.models import Assignment, AssignmentStatus, Class, ClassMember, GeneratedAssignment, InterestProfile, Profile
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
    ClassUpdate,
    GenerationStatusResponse,
    InterestProfileResponse,
    InterestsRequest,
    JoinClassRequest,
)
from app.services.domain import DomainService

router = APIRouter(tags=["domain"])
service = DomainService()

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200


def _page(limit: int, offset: int) -> tuple[int, int]:
    return max(1, min(limit, MAX_PAGE_SIZE)), max(0, offset)


def class_base(item: Class) -> dict:
    return {
        "id": item.id,
        "teacher_id": item.teacher_id,
        "name": item.name,
        "subject": item.subject,
        "grade_level": item.grade_level,
        "description": item.description,
        "join_code": item.join_code,
        "archived_at": item.archived_at,
        "created_at": item.created_at,
    }


def class_data(db: Session, item: Class) -> dict:
    return {
        **class_base(item),
        "student_count": db.scalar(select(func.count()).select_from(ClassMember).where(ClassMember.class_id == item.id)) or 0,
        "assignment_count": db.scalar(select(func.count()).select_from(Assignment).where(Assignment.class_id == item.id)) or 0,
    }


def assignment_data(item: Assignment) -> dict:
    return {"id": item.id, "class_id": item.class_id, "teacher_id": item.teacher_id, "title": item.title, "topic": item.topic, "learning_objective": item.learning_objective, "grade_level": item.grade_level, "instructions": item.instructions, "sandbox_type": item.sandbox_type, "status": item.status, "content_version": item.content_version, "published_at": item.published_at, "created_at": item.created_at}


@router.post("/classes", response_model=ClassResponse, status_code=status.HTTP_201_CREATED)
def create_class(data: ClassCreate, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)]):
    return class_data(db, service.create_class(db, teacher, data))


@router.get("/classes", response_model=ClassListResponse)
def list_classes(db: Annotated[Session, Depends(get_db)], profile: Annotated[Profile, Depends(get_authenticated_profile)], limit: int = DEFAULT_PAGE_SIZE, offset: int = 0, include_archived: bool = False):
    limit, offset = _page(limit, offset)
    # Archived classes are hidden from the default list (both roles); opt in explicitly.
    archived_filter = [] if include_archived else [Class.archived_at.is_(None)]
    if profile.role.value == "teacher":
        count_stmt = select(func.count()).select_from(Class).where(Class.teacher_id == profile.id, *archived_filter)
        page_stmt = select(Class).where(Class.teacher_id == profile.id, *archived_filter).order_by(Class.created_at.desc())
    else:
        count_stmt = select(func.count()).select_from(Class).join(ClassMember).where(ClassMember.student_id == profile.id, *archived_filter)
        page_stmt = select(Class).join(ClassMember).where(ClassMember.student_id == profile.id, *archived_filter).order_by(Class.created_at.desc())
    total = db.scalar(count_stmt) or 0
    items = db.scalars(page_stmt.limit(limit).offset(offset)).all()
    # M6: resolve member/assignment counts for the whole page in two grouped queries
    # instead of two correlated subqueries per class.
    class_ids = [item.id for item in items]
    member_counts = dict(db.execute(select(ClassMember.class_id, func.count()).where(ClassMember.class_id.in_(class_ids)).group_by(ClassMember.class_id)).all()) if class_ids else {}
    assignment_counts = dict(db.execute(select(Assignment.class_id, func.count()).where(Assignment.class_id.in_(class_ids)).group_by(Assignment.class_id)).all()) if class_ids else {}
    return {"items": [{**class_base(item), "student_count": member_counts.get(item.id, 0), "assignment_count": assignment_counts.get(item.id, 0)} for item in items], "total": total}


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


@router.patch("/classes/{class_id}", response_model=ClassResponse)
def update_class(class_id: uuid.UUID, data: ClassUpdate, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)]):
    return class_data(db, service.update_class(db, class_id, teacher, data))


@router.post("/classes/{class_id}/archive", response_model=ClassResponse)
def archive_class(class_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)]):
    return class_data(db, service.archive_class(db, class_id, teacher))


@router.post("/classes/{class_id}/unarchive", response_model=ClassResponse)
def unarchive_class(class_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)]):
    return class_data(db, service.unarchive_class(db, class_id, teacher))


@router.post("/classes/{class_id}/join-code/regenerate", response_model=ClassResponse)
def regenerate_join_code(class_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)]):
    return class_data(db, service.regenerate_join_code(db, class_id, teacher))


@router.delete("/classes/{class_id}/members/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(class_id: uuid.UUID, student_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)]) -> Response:
    service.remove_member(db, class_id, student_id, teacher)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/classes/join", response_model=ClassMembershipResponse)
def join_class(data: JoinClassRequest, response: Response, db: Annotated[Session, Depends(get_db)], student: Annotated[Profile, Depends(get_student)], _rate_limit: Annotated[None, Depends(rate_limit("join", 20, 60))] = None):
    item, created = service.join_class(db, student, data.join_code)
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return {"class_id": item.class_id, "student_id": item.student_id, "joined_at": item.joined_at}


@router.get("/classes/{class_id}/members", response_model=ClassMemberListResponse)
def members(class_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)], limit: int = DEFAULT_PAGE_SIZE, offset: int = 0):
    limit, offset = _page(limit, offset)
    service.require_owned_class(db, class_id, teacher)
    total = db.scalar(select(func.count()).select_from(ClassMember).where(ClassMember.class_id == class_id)) or 0
    items = db.execute(select(ClassMember, Profile).join(Profile, Profile.id == ClassMember.student_id).where(ClassMember.class_id == class_id).order_by(Profile.display_name).limit(limit).offset(offset)).all()
    return {"items": [{"student_id": member.student_id, "display_name": profile.display_name, "joined_at": member.joined_at} for member, profile in items], "total": total}


@router.post("/classes/{class_id}/assignments", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
def create_assignment(class_id: uuid.UUID, data: AssignmentCreate, db: Annotated[Session, Depends(get_db)], teacher: Annotated[Profile, Depends(get_teacher)]):
    return assignment_data(service.create_assignment(db, class_id, teacher, data))


@router.get("/classes/{class_id}/assignments", response_model=AssignmentListResponse)
def list_assignments(class_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], profile: Annotated[Profile, Depends(get_authenticated_profile)], limit: int = DEFAULT_PAGE_SIZE, offset: int = 0):
    limit, offset = _page(limit, offset)
    service.class_for_user(db, class_id, profile)
    filters = [Assignment.class_id == class_id]
    if profile.role.value != "teacher":
        filters.append(Assignment.status == AssignmentStatus.PUBLISHED)
    total = db.scalar(select(func.count()).select_from(Assignment).where(*filters)) or 0
    items = db.scalars(select(Assignment).where(*filters).order_by(Assignment.created_at.desc()).limit(limit).offset(offset)).all()
    return {"items": [assignment_data(item) for item in items], "total": total}


@router.get("/assignments/{assignment_id}", response_model=AssignmentResponse)
def get_assignment(assignment_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], profile: Annotated[Profile, Depends(get_authenticated_profile)]):
    return assignment_data(service.get_assignment(db, assignment_id, profile))


@router.get("/assignments/{assignment_id}/generation-status", response_model=GenerationStatusResponse)
def generation_status(assignment_id: uuid.UUID, db: Annotated[Session, Depends(get_db)], student: Annotated[Profile, Depends(get_student)]):
    # get_assignment applies the student visibility rule (member + published, else 404),
    # matching "member of the assignment's class; 404 otherwise".
    assignment = service.get_assignment(db, assignment_id, student)
    interests = db.scalar(select(InterestProfile).where(InterestProfile.student_id == student.id))
    if interests is None:
        return {"status": "none"}
    generated = db.scalar(select(GeneratedAssignment).where(
        GeneratedAssignment.assignment_id == assignment.id,
        GeneratedAssignment.assignment_content_version == assignment.content_version,
        GeneratedAssignment.student_id == student.id,
        GeneratedAssignment.interest_profile_version == interests.version,
    ))
    return {"status": generated.status.value if generated is not None else "none"}


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
