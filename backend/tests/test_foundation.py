import json
from pathlib import Path

import pytest
from fastapi import HTTPException
from jsonschema import Draft202012Validator
from sqlalchemy.exc import IntegrityError

from app.api.dependencies.auth import get_student, get_teacher
from app.core.config import Settings
from app.main import create_app
from app.models.models import Class, Profile, SandboxSession, UserRole
from app.schemas.personalization import GeneratedContent
from app.services.personalization import OPENAI_RESPONSE_SCHEMA


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
    document = response.json()
    assert "/api/v1/me" in document["paths"]
    class_schema = document["components"]["schemas"]["ClassResponse"]
    assert {"student_count", "assignment_count"}.issubset(class_schema["properties"])
    session_schema = document["components"]["schemas"]["SandboxSessionResponse"]
    assert {"reflection_answers", "submitted_at"}.issubset(session_schema["properties"])
    assert "/api/v1/assignments/{assignment_id}/progress" in document["paths"]


def test_generated_assignment_example_matches_the_persisted_contract():
    root = Path(__file__).parents[2]
    example = json.loads((root / "contracts" / "examples" / "generated-assignment-basketball.json").read_text(encoding="utf-8"))
    schema = json.loads((root / "contracts" / "sandbox-spec.schema.json").read_text(encoding="utf-8"))
    generated = GeneratedContent.model_validate(example)
    Draft202012Validator(schema).validate(generated.sandbox_spec)
    assert [question.model_dump() for question in generated.reflection_questions] == generated.sandbox_spec["reflection_questions"]


def test_openai_response_schema_is_strict_at_every_object():
    assert "provider_response_id" not in OPENAI_RESPONSE_SCHEMA["properties"]

    def assert_strict(node: object) -> None:
        if isinstance(node, dict):
            properties = node.get("properties")
            if isinstance(properties, dict):
                assert node.get("additionalProperties") is False
                assert set(node.get("required", [])) == set(properties)
            for value in node.values():
                assert_strict(value)
        elif isinstance(node, list):
            for value in node:
                assert_strict(value)

    assert_strict(OPENAI_RESPONSE_SCHEMA)


def test_sandbox_session_model_matches_applied_schema():
    columns = set(SandboxSession.__table__.columns.keys())
    assert "created_at" not in columns
    assert {"started_at", "updated_at"}.issubset(columns)


def test_missing_token(client):
    response = client[0].get("/api/v1/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"


def test_development_cors_allows_localhost_and_loopback():
    app = create_app(Settings(environment="development", frontend_url="http://localhost:5173"))
    from fastapi.testclient import TestClient

    with TestClient(app) as test_client:
        for origin in ("http://localhost:5173", "http://127.0.0.1:5173"):
            response = test_client.options("/api/v1/me", headers={"Origin": origin, "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization"})
            assert response.status_code == 200
            assert response.headers["access-control-allow-origin"] == origin


def test_production_requires_clerk_auth_settings():
    incomplete = Settings(_env_file=None, environment="production")
    with pytest.raises(RuntimeError, match="CLERK_JWKS_URL"):
        incomplete.validate_production()
    settings = Settings(environment="production", clerk_jwks_url="https://clerk.example/.well-known/jwks.json", clerk_issuer="https://clerk.example", clerk_authorized_parties="https://app.example", clerk_secret_key="secret_test_key")
    settings.validate_production()
    assert settings.clerk_issuer == "https://clerk.example"


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


def test_class_contract_includes_live_counts(client):
    test_client, _ = client
    assert test_client.post("/api/v1/profiles/bootstrap", headers=auth(), json={"display_name": "Bao", "role": "teacher"}).status_code == 201
    created = test_client.post("/api/v1/classes", headers=auth(), json={"name": "Physics", "subject": "Physics", "grade_level": "10"})
    assert created.status_code == 201
    classroom = created.json()
    assert classroom["student_count"] == 0
    assert classroom["assignment_count"] == 0
    assignment = test_client.post(f"/api/v1/classes/{classroom['id']}/assignments", headers=auth(), json={"title": "Force", "topic": "Forces", "learning_objective": "Apply F = ma.", "grade_level": "10", "sandbox_type": "parameter_explorer"})
    assert assignment.status_code == 201
    listed = test_client.get("/api/v1/classes", headers=auth())
    assert listed.status_code == 200
    assert listed.json()["items"][0]["assignment_count"] == 1


def test_role_dependencies():
    teacher = Profile(auth_user_id="user_test_teacher", email="teacher@example.test", display_name="Teacher", role=UserRole.TEACHER)
    student = Profile(auth_user_id="user_test_student", email="student@example.test", display_name="Student", role=UserRole.STUDENT)
    assert get_teacher(teacher) is teacher
    assert get_student(student) is student
    with pytest.raises(HTTPException) as exc:
        get_student(teacher)
    assert exc.value.status_code == 403


def test_important_database_uniqueness_constraints(client):
    _, session_factory = client
    db = session_factory()
    teacher = Profile(auth_user_id="user_test_teacher", email="teacher@example.test", display_name="Teacher", role=UserRole.TEACHER)
    db.add(teacher)
    db.commit()
    db.add_all([
        Class(teacher_id=teacher.id, name="One", subject="Physics", grade_level="10", join_code="UNIQUE"),
        Class(teacher_id=teacher.id, name="Two", subject="Physics", grade_level="10", join_code="UNIQUE"),
    ])
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()
