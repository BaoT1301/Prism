"""Idempotent local demo seed. Run only against a local/demo database."""

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.models import Assignment, AssignmentStatus, Class, ClassMember, InterestProfile, Profile, UserRole


def profile(db, email: str, name: str, role: UserRole) -> Profile:
    item = db.scalar(select(Profile).where(Profile.email == email))
    if item is None:
        item = Profile(auth_user_id=f"seed_{role.value}_{email}", email=email, display_name=name, role=role)
        db.add(item)
        db.flush()
    return item


def main() -> None:
    with SessionLocal() as db:
        teacher = profile(db, "teacher.demo@example.test", "Ms. Rivera", UserRole.TEACHER)
        students = [
            profile(db, "basketball.demo@example.test", "Jordan", UserRole.STUDENT),
            profile(db, "formula1.demo@example.test", "Avery", UserRole.STUDENT),
            profile(db, "space.demo@example.test", "Riley", UserRole.STUDENT),
        ]
        classroom = db.scalar(select(Class).where(Class.join_code == "PRISM101"))
        if classroom is None:
            classroom = Class(teacher_id=teacher.id, name="Physics 101", subject="Physics", grade_level="10", join_code="PRISM101")
            db.add(classroom)
            db.flush()
        interests = ["basketball", "Formula 1", "space"]
        for student, interest in zip(students, interests, strict=True):
            if not db.scalar(select(ClassMember).where(ClassMember.class_id == classroom.id, ClassMember.student_id == student.id)):
                db.add(ClassMember(class_id=classroom.id, student_id=student.id))
            if not db.scalar(select(InterestProfile).where(InterestProfile.student_id == student.id)):
                db.add(InterestProfile(student_id=student.id, sports=[interest]))
        if not db.scalar(select(Assignment).where(Assignment.class_id == classroom.id, Assignment.title == "Newton's Second Law Lab")):
            db.add(Assignment(class_id=classroom.id, teacher_id=teacher.id, title="Newton's Second Law Lab", topic="Newton's Second Law", learning_objective="Apply F = ma to calculate force, mass, or acceleration.", grade_level="10", instructions="Explore how mass and acceleration affect force.", sandbox_type="parameter_explorer", status=AssignmentStatus.PUBLISHED))
        db.commit()
    print("Demo seed completed.")


if __name__ == "__main__":
    main()
