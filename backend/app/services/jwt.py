import uuid
from dataclasses import dataclass
from typing import Any, Protocol

import jwt
from jwt import PyJWKClient

from app.core.config import Settings
from app.core.errors import ApiError


@dataclass(frozen=True)
class AuthClaims:
    subject: uuid.UUID
    email: str | None


class TokenVerifier(Protocol):
    def verify(self, token: str) -> AuthClaims: ...


class SupabaseJwtVerifier:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.jwk_client = PyJWKClient(settings.supabase_jwks_url) if settings.supabase_jwks_url else None

    def verify(self, token: str) -> AuthClaims:
        if not all([self.jwk_client, self.settings.supabase_issuer, self.settings.supabase_audience]):
            raise ApiError(503, "AUTH_NOT_CONFIGURED", "Authentication verification is not configured.")
        try:
            signing_key = self.jwk_client.get_signing_key_from_jwt(token).key
            payload: dict[str, Any] = jwt.decode(token, signing_key, algorithms=["RS256", "ES256"], issuer=self.settings.supabase_issuer, audience=self.settings.supabase_audience, options={"require": ["exp", "sub"]})
            return AuthClaims(subject=uuid.UUID(payload["sub"]), email=payload.get("email"))
        except jwt.ExpiredSignatureError as exc:
            raise ApiError(401, "TOKEN_EXPIRED", "Authentication token has expired.") from exc
        except (jwt.InvalidTokenError, ValueError) as exc:
            raise ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.") from exc
