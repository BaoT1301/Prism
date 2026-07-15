from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
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

    def bootstrap(self, db: Session, claims: AuthClaims, data: ProfileBootstrapRequest) -> tuple[Profile, bool]:
        profile = self.get_by_auth_id(db, claims.subject)
        if profile is not None:
            if profile.role != data.role:
                raise ApiError(409, "PROFILE_ALREADY_EXISTS", "Profile already exists with a different role.")
            return profile, False
        if not claims.email:
            raise ApiError(401, "INVALID_TOKEN", "Verified token does not include an email claim.")
        profile = Profile(auth_user_id=claims.subject, email=claims.email, display_name=data.display_name.strip(), role=data.role)
        db.add(profile)
        db.commit()
        db.refresh(profile)
        return profile, True

    def require_role(self, profile: Profile, expected: UserRole) -> Profile:
        if profile.role != expected:
            raise ApiError(403, "INSUFFICIENT_ROLE", "Your profile does not have access to this resource.")
        return profile
