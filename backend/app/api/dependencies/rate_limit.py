"""Lightweight in-process rate limiting (M2).

A token-bucket keyed by the caller's bearer token (falling back to client IP). State
lives in THIS worker's memory, so it only bounds a single process — a multi-instance
deployment needs a shared store (e.g. Redis) to enforce a global limit. It is intended
as a first line of defence for abuse-prone endpoints (join-code guessing, expensive AI
generation, hint spam, profile bootstrap), not as a billing-grade quota.
"""
import hashlib
import threading
import time
from collections.abc import Callable

from fastapi import Request

from app.core.errors import ApiError


class TokenBucketLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, tuple[float, float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str, capacity: int, refill_per_second: float, now: float | None = None) -> bool:
        now = time.monotonic() if now is None else now
        with self._lock:
            tokens, last = self._buckets.get(key, (float(capacity), now))
            tokens = min(float(capacity), tokens + (now - last) * refill_per_second)
            if tokens < 1.0:
                self._buckets[key] = (tokens, now)
                return False
            self._buckets[key] = (tokens - 1.0, now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()


limiter = TokenBucketLimiter()


def _client_identity(request: Request) -> str:
    authorization = request.headers.get("Authorization")
    if authorization:
        return "tok:" + hashlib.sha256(authorization.encode("utf-8")).hexdigest()[:24]
    client = request.client.host if request.client else "unknown"
    return "ip:" + client


def rate_limit(scope: str, capacity: int, per_seconds: float) -> Callable[[Request], None]:
    refill_per_second = capacity / per_seconds

    def dependency(request: Request) -> None:
        key = f"{scope}:{_client_identity(request)}"
        if not limiter.allow(key, capacity, refill_per_second):
            raise ApiError(429, "RATE_LIMITED", "Too many requests. Please slow down and try again.")

    return dependency
