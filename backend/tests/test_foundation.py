import json
import logging
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


def test_unhandled_errors_are_logged_with_request_correlation(caplog):
    app = create_app(Settings(environment="test", _env_file=None))

    @app.get("/_test/unhandled-error")
    def unhandled_error() -> None:
        raise RuntimeError("intentional test failure")

    from fastapi.testclient import TestClient

    caplog.set_level(logging.ERROR, logger="app.error")
    with TestClient(app, raise_server_exceptions=False) as test_client:
        response = test_client.get("/_test/unhandled-error", headers={"X-Request-ID": "req-test-500"})

    assert response.status_code == 500
    assert response.json()["error"] == {
        "code": "INTERNAL_ERROR",
        "message": "An unexpected error occurred.",
        "request_id": "req-test-500",
    }
    assert response.headers["X-Request-ID"] == "req-test-500"
    assert "route=/_test/unhandled-error request_id=req-test-500 exception_type=RuntimeError" in caplog.text


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


def test_request_id_injection_is_rejected_but_safe_values_pass(client):
    test_client, _ = client
    # A value with characters outside the allow-list (space/!) must not be echoed back (L3).
    injected = test_client.get("/health", headers={"X-Request-ID": "not a valid id!"})
    assert injected.headers["X-Request-ID"] != "not a valid id!"
    # A well-formed correlation id is honored end to end.
    safe = test_client.get("/health", headers={"X-Request-ID": "req-ok-123"})
    assert safe.headers["X-Request-ID"] == "req-ok-123"


def test_list_classes_is_paginated_with_accurate_total(client):
    test_client, _ = client
    assert test_client.post("/api/v1/profiles/bootstrap", headers=auth(), json={"display_name": "Bao", "role": "teacher"}).status_code == 201
    for index in range(3):
        assert test_client.post("/api/v1/classes", headers=auth(), json={"name": f"Class {index}", "subject": "Physics", "grade_level": "10"}).status_code == 201
    first = test_client.get("/api/v1/classes?limit=2&offset=0", headers=auth()).json()
    assert len(first["items"]) == 2 and first["total"] == 3
    second = test_client.get("/api/v1/classes?limit=2&offset=2", headers=auth()).json()
    assert len(second["items"]) == 1 and second["total"] == 3


def test_bootstrap_is_rate_limited(client):
    test_client, _ = client
    payload = {"display_name": "Bao", "role": "teacher"}
    statuses = [test_client.post("/api/v1/profiles/bootstrap", headers=auth(), json=payload).status_code for _ in range(11)]
    assert statuses[-1] == 429  # capacity is 10 per minute per caller
    assert statuses.count(429) == 1


def test_token_bucket_limiter_denies_after_capacity_then_refills():
    from app.api.dependencies.rate_limit import TokenBucketLimiter

    limiter = TokenBucketLimiter()
    assert all(limiter.allow("k", capacity=3, refill_per_second=0.0, now=100.0) for _ in range(3))
    assert not limiter.allow("k", capacity=3, refill_per_second=0.0, now=100.0)
    assert limiter.allow("k", capacity=3, refill_per_second=1.0, now=101.5)


def test_join_code_uses_unambiguous_fixed_alphabet():
    from app.services.domain import _JOIN_CODE_ALPHABET, _JOIN_CODE_LENGTH, generate_join_code

    assert not set("O0I1L") & set(_JOIN_CODE_ALPHABET)
    for _ in range(200):
        code = generate_join_code()
        assert len(code) == _JOIN_CODE_LENGTH
        assert set(code) <= set(_JOIN_CODE_ALPHABET)
