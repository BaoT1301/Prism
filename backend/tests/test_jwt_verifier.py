"""Unit tests for ClerkJwtVerifier (H4, M1).

These exercise the real verification path — signature, issuer, expiry, subject shape and
the azp authorized-party rule — using a locally minted RSA keypair and a stubbed JWKS so
no network or live Clerk instance is required.
"""
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app.core.config import Settings
from app.core.errors import ApiError
from app.services.jwt import ClerkJwtVerifier

ISSUER = "https://clerk.example"
PARTY = "https://app.example"


class _FakeSigningKey:
    def __init__(self, key) -> None:
        self.key = key


class _FakeJWKClient:
    def __init__(self, public_key) -> None:
        self._public_key = public_key

    def get_signing_key_from_jwt(self, token: str) -> _FakeSigningKey:
        return _FakeSigningKey(self._public_key)


@pytest.fixture(scope="module")
def keypair():
    signing_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return signing_key, signing_key.public_key()


def _verifier(public_key, *, authorized_parties: str = PARTY) -> ClerkJwtVerifier:
    settings = Settings(_env_file=None, environment="test", clerk_jwks_url="https://clerk.example/jwks", clerk_issuer=ISSUER, clerk_authorized_parties=authorized_parties)
    verifier = ClerkJwtVerifier(settings)
    verifier.jwk_client = _FakeJWKClient(public_key)
    return verifier


def _token(signing_key, **overrides) -> str:
    now = int(time.time())
    payload = {"sub": "user_abc123", "iss": ISSUER, "azp": PARTY, "email": "learner@example.test", "iat": now, "exp": now + 300}
    payload.update(overrides)
    return jwt.encode(payload, signing_key, algorithm="RS256")


def test_valid_token_is_accepted(keypair):
    signing_key, public_key = keypair
    claims = _verifier(public_key).verify(_token(signing_key))
    assert claims.subject == "user_abc123"
    assert claims.email == "learner@example.test"


def test_expired_token_is_rejected(keypair):
    signing_key, public_key = keypair
    now = int(time.time())
    with pytest.raises(ApiError) as error:
        _verifier(public_key).verify(_token(signing_key, iat=now - 600, exp=now - 300))
    assert error.value.detail["code"] == "TOKEN_EXPIRED"


def test_wrong_issuer_is_rejected(keypair):
    signing_key, public_key = keypair
    with pytest.raises(ApiError) as error:
        _verifier(public_key).verify(_token(signing_key, iss="https://evil.example"))
    assert error.value.detail["code"] == "INVALID_TOKEN"


def test_missing_azp_is_rejected_when_parties_configured(keypair):
    signing_key, public_key = keypair
    token = _token(signing_key)
    # Re-mint without an azp claim entirely.
    token = jwt.encode({"sub": "user_abc123", "iss": ISSUER, "exp": int(time.time()) + 300}, signing_key, algorithm="RS256")
    with pytest.raises(ApiError) as error:
        _verifier(public_key).verify(token)
    assert error.value.detail["code"] == "INVALID_TOKEN"


def test_unlisted_azp_is_rejected(keypair):
    signing_key, public_key = keypair
    with pytest.raises(ApiError) as error:
        _verifier(public_key).verify(_token(signing_key, azp="https://other-app.example"))
    assert error.value.detail["code"] == "INVALID_TOKEN"


def test_non_clerk_subject_is_rejected(keypair):
    signing_key, public_key = keypair
    with pytest.raises(ApiError) as error:
        _verifier(public_key).verify(_token(signing_key, sub="admin"))
    assert error.value.detail["code"] == "INVALID_TOKEN"


def test_signature_from_a_different_key_is_rejected(keypair):
    _, public_key = keypair
    attacker_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(ApiError) as error:
        _verifier(public_key).verify(_token(attacker_key))
    assert error.value.detail["code"] == "INVALID_TOKEN"


def test_missing_azp_is_allowed_when_no_parties_configured(keypair):
    signing_key, public_key = keypair
    token = jwt.encode({"sub": "user_abc123", "iss": ISSUER, "exp": int(time.time()) + 300}, signing_key, algorithm="RS256")
    claims = _verifier(public_key, authorized_parties="").verify(token)
    assert claims.subject == "user_abc123"
