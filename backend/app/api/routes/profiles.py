from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import get_claims, get_authenticated_profile
from app.api.dependencies.rate_limit import rate_limit
from app.core.config import get_settings
from app.db.session import get_db
from app.models.models import AuditEvent, Profile
from app.schemas.domain import AuditEventListResponse
from app.schemas.profiles import ProfileBootstrapRequest, ProfileResponse
from app.services.jwt import AuthClaims
from app.services.profiles import ProfileService

router = APIRouter(tags=["profiles"])
service = ProfileService()

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200


def _page(limit: int, offset: int) -> tuple[int, int]:
    return max(1, min(limit, MAX_PAGE_SIZE)), max(0, offset)


@router.get("/me", response_model=ProfileResponse)
def get_me(profile: Annotated[Profile, Depends(get_authenticated_profile)]) -> Profile:
    return profile


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(profile: Annotated[Profile, Depends(get_authenticated_profile)], db: Annotated[Session, Depends(get_db)]) -> Response:
    service.delete_account(db, profile)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me/audit", response_model=AuditEventListResponse)
def my_audit(profile: Annotated[Profile, Depends(get_authenticated_profile)], db: Annotated[Session, Depends(get_db)], limit: int = DEFAULT_PAGE_SIZE, offset: int = 0):
    limit, offset = _page(limit, offset)
    total = db.scalar(select(func.count()).select_from(AuditEvent).where(AuditEvent.actor_id == profile.id)) or 0
    items = db.scalars(
        select(AuditEvent).where(AuditEvent.actor_id == profile.id).order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc()).limit(limit).offset(offset)
    ).all()
    return {"items": items, "total": total}


@router.post("/profiles/bootstrap", response_model=ProfileResponse, status_code=status.HTTP_201_CREATED)
def bootstrap_profile(data: ProfileBootstrapRequest, claims: Annotated[AuthClaims, Depends(get_claims)], db: Annotated[Session, Depends(get_db)], response: Response, _rate_limit: Annotated[None, Depends(rate_limit("bootstrap", 10, 60))] = None) -> Profile:
    profile, created = service.bootstrap(db, claims, data, get_settings())
    if not created:
        response.status_code = status.HTTP_200_OK
    return profile
