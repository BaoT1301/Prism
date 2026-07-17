from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError
from app.db.session import get_db
from app.models.models import Profile, UserRole
from app.services.jwt import AuthClaims, ClerkJwtVerifier, TokenVerifier
from app.services.profiles import ProfileService

bearer = HTTPBearer(auto_error=False)
profile_service = ProfileService()


def get_token_verifier() -> TokenVerifier:
    return ClerkJwtVerifier(get_settings())


def get_claims(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)], verifier: Annotated[TokenVerifier, Depends(get_token_verifier)]) -> AuthClaims:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise ApiError(401, "AUTHENTICATION_REQUIRED", "A bearer token is required.")
    return verifier.verify(credentials.credentials)


def get_authenticated_profile(claims: Annotated[AuthClaims, Depends(get_claims)], db: Annotated[Session, Depends(get_db)]) -> Profile:
    return profile_service.require_profile(db, claims)


def get_teacher(profile: Annotated[Profile, Depends(get_authenticated_profile)]) -> Profile:
    return profile_service.require_role(profile, UserRole.TEACHER)


def get_student(profile: Annotated[Profile, Depends(get_authenticated_profile)]) -> Profile:
    return profile_service.require_role(profile, UserRole.STUDENT)
