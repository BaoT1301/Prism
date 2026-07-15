import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.api.dependencies.auth import get_student, get_teacher
from app.models.models import Class, Profile, UserRole


def auth(token: str = "valid") -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_health_success(client):
    response = client[0].get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["X-Request-ID"]


def test_openapi_generation(client):
    response = client[0].get("/openapi.json")
    assert response.status_code == 200
    assert "/api/v1/me" in response.json()["paths"]


def test_missing_token(client):
    response = client[0].get("/api/v1/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"


@pytest.mark.parametrize("token", ["malformed", "expired", "wrong-issuer", "wrong-audience"])
def test_invalid_tokens(client, token):
    response = client[0].get("/api/v1/me", headers=auth(token))
    assert response.status_code == 401


def test_profile_not_provisioned(client):
    response = client[0].get("/api/v1/me", headers=auth())
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "PROFILE_NOT_PROVISIONED"


def test_bootstrap_and_authenticated_profile(client, subject):
    test_client, _ = client
    response = test_client.post("/api/v1/profiles/bootstrap", headers=auth(), json={"display_name": "Bao", "role": "teacher"})
    assert response.status_code == 201
    assert response.json()["auth_user_id"] == str(subject)
    response = test_client.get("/api/v1/me", headers=auth())
    assert response.status_code == 200
    assert response.json()["role"] == "teacher"


def test_duplicate_bootstrap_is_idempotent_and_role_conflict(client):
    test_client, _ = client
    payload = {"display_name": "Bao", "role": "student"}
    assert test_client.post("/api/v1/profiles/bootstrap", headers=auth(), json=payload).status_code == 201
    assert test_client.post("/api/v1/profiles/bootstrap", headers=auth(), json=payload).status_code == 200
    response = test_client.post("/api/v1/profiles/bootstrap", headers=auth(), json={"display_name": "Bao", "role": "teacher"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "PROFILE_ALREADY_EXISTS"


def test_role_dependencies():
    teacher = Profile(auth_user_id=uuid.uuid4(), email="teacher@example.test", display_name="Teacher", role=UserRole.TEACHER)
    student = Profile(auth_user_id=uuid.uuid4(), email="student@example.test", display_name="Student", role=UserRole.STUDENT)
    assert get_teacher(teacher) is teacher
    assert get_student(student) is student
    with pytest.raises(HTTPException) as exc:
        get_student(teacher)
    assert exc.value.status_code == 403


def test_important_database_uniqueness_constraints(client):
    _, session_factory = client
    db = session_factory()
    teacher = Profile(auth_user_id=uuid.uuid4(), email="teacher@example.test", display_name="Teacher", role=UserRole.TEACHER)
    db.add(teacher)
    db.commit()
    db.add_all([
        Class(teacher_id=teacher.id, name="One", subject="Physics", grade_level="10", join_code="UNIQUE"),
        Class(teacher_id=teacher.id, name="Two", subject="Physics", grade_level="10", join_code="UNIQUE"),
    ])
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
