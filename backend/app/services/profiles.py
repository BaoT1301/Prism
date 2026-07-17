import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.config import Settings
from app.models.models import Profile, UserRole
from app.schemas.profiles import ProfileBootstrapRequest
from app.services.jwt import AuthClaims


class ProfileService:
    def get_by_auth_id(self, db: Session, auth_user_id) -> Profile | None:
        return db.scalar(select(Profile).where(Profile.auth_user_id == auth_user_id))

    def require_profile(self, db: Session, claims: AuthClaims) -> Profile:
        profile = self.get_by_auth_id(db, claims.subject)
        if profile is None:
            raise ApiError(404, "PROFILE_NOT_PROVISIONED", "Application profile has not been provisioned.")
        return profile

    def bootstrap(self, db: Session, claims: AuthClaims, data: ProfileBootstrapRequest, settings: Settings) -> tuple[Profile, bool]:
        profile = self.get_by_auth_id(db, claims.subject)
        if profile is not None:
            if profile.role != data.role:
                raise ApiError(409, "PROFILE_ALREADY_EXISTS", "Profile already exists with a different role.")
            return profile, False
        profile = Profile(auth_user_id=claims.subject, email=claims.email or self.primary_email(claims.subject, settings), display_name=data.display_name.strip(), role=data.role)
        db.add(profile)
        db.commit()
        db.refresh(profile)
        return profile, True

    def require_role(self, profile: Profile, expected: UserRole) -> Profile:
        if profile.role != expected:
            raise ApiError(403, "INSUFFICIENT_ROLE", "Your profile does not have access to this resource.")
        return profile

    def primary_email(self, user_id: str, settings: Settings) -> str:
        if not settings.clerk_secret_key:
            raise ApiError(503, "AUTH_NOT_CONFIGURED", "Clerk user lookup is not configured.")
        try:
            response = httpx.get(f"{settings.clerk_api_url.rstrip('/')}/v1/users/{user_id}", headers={"Authorization": f"Bearer {settings.clerk_secret_key}"}, timeout=10.0)
            response.raise_for_status()
            payload = response.json()
            primary_id = payload.get("primary_email_address_id")
            email = next((item.get("email_address") for item in payload.get("email_addresses", []) if item.get("id") == primary_id), None)
            if not isinstance(email, str) or not email:
                raise ValueError("Clerk user has no primary email.")
            return email
        except (httpx.HTTPError, ValueError, TypeError) as exc:
            raise ApiError(401, "INVALID_TOKEN", "Verified Clerk user does not have a usable email address.") from exc
