import secrets
import uuid
from datetime import datetime, UTC

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models.models import Assignment, AssignmentStatus, Class, ClassMember, InterestProfile, Profile
from app.schemas.domain import AssignmentCreate, AssignmentUpdate, ClassCreate, InterestsRequest

SUPPORTED_SANDBOXES = {"parameter_explorer"}


class DomainService:
    def create_class(self, db: Session, teacher: Profile, data: ClassCreate) -> Class:
        for _ in range(5):
            item = Class(teacher_id=teacher.id, **data.model_dump(), join_code=secrets.token_urlsafe(6).upper()[:8])
            db.add(item)
            try:
                db.commit()
                db.refresh(item)
                return item
            except IntegrityError:
                db.rollback()
        raise ApiError(503, "JOIN_CODE_UNAVAILABLE", "Unable to create a class join code.")

    def class_for_user(self, db: Session, class_id: uuid.UUID, profile: Profile) -> Class:
        item = db.get(Class, class_id)
        if item is None:
            raise ApiError(404, "CLASS_NOT_FOUND", "The requested class was not found.")
        if item.teacher_id == profile.id:
            return item
        member = db.scalar(select(ClassMember.id).where(ClassMember.class_id == class_id, ClassMember.student_id == profile.id))
        if member is None:
            raise ApiError(404, "CLASS_NOT_FOUND", "The requested class was not found.")
        return item

    def require_owned_class(self, db: Session, class_id: uuid.UUID, teacher: Profile) -> Class:
        item = db.get(Class, class_id)
        if item is None or item.teacher_id != teacher.id:
            raise ApiError(404, "CLASS_NOT_FOUND", "The requested class was not found.")
        return item

    def join_class(self, db: Session, student: Profile, code: str) -> tuple[ClassMember, bool]:
        item = db.scalar(select(Class).where(Class.join_code == code.upper().strip()))
        if item is None:
            raise ApiError(404, "INVALID_JOIN_CODE", "The join code was not found.")
        membership = db.scalar(select(ClassMember).where(ClassMember.class_id == item.id, ClassMember.student_id == student.id))
        if membership:
            return membership, False
        membership = ClassMember(class_id=item.id, student_id=student.id)
        db.add(membership)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            membership = db.scalar(select(ClassMember).where(ClassMember.class_id == item.id, ClassMember.student_id == student.id))
            if membership:
                return membership, False
            raise
        db.refresh(membership)
        return membership, True

    def create_assignment(self, db: Session, class_id: uuid.UUID, teacher: Profile, data: AssignmentCreate) -> Assignment:
        self.require_owned_class(db, class_id, teacher)
        if data.sandbox_type not in SUPPORTED_SANDBOXES:
            raise ApiError(422, "UNSUPPORTED_SANDBOX_TYPE", "The requested sandbox type is not supported.")
        item = Assignment(class_id=class_id, teacher_id=teacher.id, **data.model_dump())
        db.add(item)
        db.commit()
        db.refresh(item)
        return item

    def get_assignment(self, db: Session, assignment_id: uuid.UUID, profile: Profile) -> Assignment:
        item = db.get(Assignment, assignment_id)
        if item is None:
            raise ApiError(404, "ASSIGNMENT_NOT_FOUND", "The requested assignment was not found.")
        self.class_for_user(db, item.class_id, profile)
        if item.teacher_id != profile.id and item.status != AssignmentStatus.PUBLISHED:
            raise ApiError(404, "ASSIGNMENT_NOT_FOUND", "The requested assignment was not found.")
        return item

    def update_assignment(self, db: Session, assignment_id: uuid.UUID, teacher: Profile, data: AssignmentUpdate) -> Assignment:
        item = self.get_assignment(db, assignment_id, teacher)
        if item.status != AssignmentStatus.DRAFT:
            raise ApiError(409, "ASSIGNMENT_ALREADY_PUBLISHED", "Published assignments cannot be edited.")
        changes = data.model_dump(exclude_unset=True)
        if changes.get("sandbox_type") and changes["sandbox_type"] not in SUPPORTED_SANDBOXES:
            raise ApiError(422, "UNSUPPORTED_SANDBOX_TYPE", "The requested sandbox type is not supported.")
        if changes:
            for key, value in changes.items():
                setattr(item, key, value)
            item.content_version += 1
            db.commit()
            db.refresh(item)
        return item

    def publish_assignment(self, db: Session, assignment_id: uuid.UUID, teacher: Profile) -> Assignment:
        item = self.get_assignment(db, assignment_id, teacher)
        if item.status == AssignmentStatus.PUBLISHED:
            return item
        if item.sandbox_type not in SUPPORTED_SANDBOXES:
            raise ApiError(422, "UNSUPPORTED_SANDBOX_TYPE", "The requested sandbox type is not supported.")
        item.status = AssignmentStatus.PUBLISHED
        item.published_at = datetime.now(UTC)
        db.commit()
        db.refresh(item)
        return item

    def save_interests(self, db: Session, student: Profile, data: InterestsRequest) -> InterestProfile:
        item = db.scalar(select(InterestProfile).where(InterestProfile.student_id == student.id))
        values = data.model_dump()
        if item is None:
            item = InterestProfile(student_id=student.id, **values)
            db.add(item)
        elif any(getattr(item, key) != value for key, value in values.items()):
            for key, value in values.items():
                setattr(item, key, value)
            item.version += 1
        db.commit()
        db.refresh(item)
        return item
