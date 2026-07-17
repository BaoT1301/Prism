import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.dependencies.auth import get_token_verifier
from app.core.errors import ApiError
from app.db.session import get_db
from app.main import create_app
from app.models.models import Base
from app.services.jwt import AuthClaims


class FakeVerifier:
    def __init__(self, subject: str) -> None:
        self.claims = AuthClaims(subject=subject, email="learner@example.test")

    def verify(self, token: str) -> AuthClaims:
        if token == "expired":
            raise ApiError(401, "TOKEN_EXPIRED", "Authentication token has expired.")
        if token == "wrong-issuer":
            raise ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.")
        if token == "wrong-audience":
            raise ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.")
        if token != "valid":
            raise ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.")
        return self.claims


@pytest.fixture
def subject() -> str:
    return "user_test_learner"


@pytest.fixture
def client(subject: str):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app = create_app()

    def override_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_token_verifier] = lambda: FakeVerifier(subject)
    with TestClient(app) as test_client:
        yield test_client, session_factory
