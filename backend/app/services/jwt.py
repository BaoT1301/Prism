from dataclasses import dataclass
from typing import Any, Protocol

import jwt
from jwt import PyJWKClient

from app.core.config import Settings
from app.core.errors import ApiError


@dataclass(frozen=True)
class AuthClaims:
    subject: str
    email: str | None


class TokenVerifier(Protocol):
    def verify(self, token: str) -> AuthClaims: ...


class ClerkJwtVerifier:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.jwk_client = PyJWKClient(settings.clerk_jwks_url) if settings.clerk_jwks_url else None

    def verify(self, token: str) -> AuthClaims:
        if not all([self.jwk_client, self.settings.clerk_issuer]):
            raise ApiError(503, "AUTH_NOT_CONFIGURED", "Authentication verification is not configured.")
        try:
            signing_key = self.jwk_client.get_signing_key_from_jwt(token).key
            payload: dict[str, Any] = jwt.decode(token, signing_key, algorithms=["RS256"], issuer=self.settings.clerk_issuer, options={"require": ["exp", "iss", "sub"]})
            subject = payload["sub"]
            if not isinstance(subject, str) or not subject.startswith("user_"):
                raise ValueError("Clerk subject is invalid.")
            # M1: Clerk session tokens carry `azp` (authorized party) rather than `aud`.
            # When authorized parties are configured (required in production), the claim
            # must be PRESENT and allow-listed — a token minted without `azp` (e.g. a JWT
            # template or M2M token) from the same issuer must not be accepted.
            authorized_parties = {item.strip() for item in self.settings.clerk_authorized_parties.split(",") if item.strip()}
            if authorized_parties:
                authorized_party = payload.get("azp")
                if not isinstance(authorized_party, str) or authorized_party not in authorized_parties:
                    raise ValueError("Clerk authorized party is missing or not permitted.")
            return AuthClaims(subject=subject, email=payload.get("email") if isinstance(payload.get("email"), str) else None)
        except jwt.ExpiredSignatureError as exc:
            raise ApiError(401, "TOKEN_EXPIRED", "Authentication token has expired.") from exc
        except (jwt.InvalidTokenError, ValueError) as exc:
            raise ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.") from exc
