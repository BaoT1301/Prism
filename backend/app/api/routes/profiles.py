from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import get_claims, get_authenticated_profile
from app.core.config import get_settings
from app.db.session import get_db
from app.models.models import Profile
from app.schemas.profiles import ProfileBootstrapRequest, ProfileResponse
from app.services.jwt import AuthClaims
from app.services.profiles import ProfileService

router = APIRouter(tags=["profiles"])
service = ProfileService()


@router.get("/me", response_model=ProfileResponse)
def get_me(profile: Annotated[Profile, Depends(get_authenticated_profile)]) -> Profile:
    return profile


@router.post("/profiles/bootstrap", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED)
def bootstrap_profile(data: ProfileBootstrapRequest, claims: Annotated[AuthClaims, Depends(get_claims)], db: Annotated[Session, Depends(get_db)], response: Response) -> Profile:
    profile, created = service.bootstrap(db, claims, data, get_settings())
    if not created:
        response.status_code = status.HTTP_200_OK
    return profile
