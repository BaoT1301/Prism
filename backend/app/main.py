import logging
import re
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.core.errors import error_response, http_exception_handler
from app.db.session import get_engine

error_logger = logging.getLogger("app.error")

# L3: an inbound correlation id is only honored if it is a bounded, safe token. This keeps
# a client from injecting newlines/control characters into logs or forging arbitrary
# correlation values while still allowing well-formed ids to flow through.
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,128}$")


def _resolve_request_id(raw: str | None) -> str:
    return raw if raw and _REQUEST_ID_RE.fullmatch(raw) else str(uuid.uuid4())


async def internal_error_handler(request: Request, exc: Exception):
    error_logger.exception(
        "unhandled_exception route=%s request_id=%s exception_type=%s",
        request.url.path,
        getattr(request.state, "request_id", "unknown"),
        type(exc).__name__,
    )
    return error_response(request, 500, "INTERNAL_ERROR", "An unexpected error occurred.")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=settings.log_level.upper(), format="%(asctime)s %(levelname)s %(name)s %(message)s")
    # M8: make it obvious in logs which personalization model is active and whether the
    # deterministic fixture provider is being used (demo_mode or a missing API key).
    logging.getLogger("app.startup").info(
        "personalization_configured model=%s demo_mode=%s openai_configured=%s",
        settings.openai_model,
        settings.demo_mode,
        bool(settings.openai_api_key),
    )
    app = FastAPI(title="Prism API", version="0.1.0", description="API for the personalized learning platform.")
    allowed_origins = [settings.frontend_url]
    if settings.environment in {"development", "test"}:
        allowed_origins.extend(origin for origin in ("http://localhost:5173", "http://127.0.0.1:5173") if origin not in allowed_origins)
    app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

    @app.middleware("http")
    async def request_context(request: Request, call_next):
        request.state.request_id = _resolve_request_id(request.headers.get("X-Request-ID"))
        started = time.perf_counter()
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        logging.getLogger("app.request").info("request_complete route=%s status=%s duration_ms=%d request_id=%s", request.url.path, response.status_code, (time.perf_counter() - started) * 1000, request.state.request_id)
        return response

    app.add_exception_handler(Exception, internal_error_handler)
    from fastapi import HTTPException
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, lambda request, exc: error_response(request, 422, "VALIDATION_ERROR", "Request validation failed."))

    @app.get("/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/ready", tags=["health"])
    def ready() -> dict[str, str]:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"status": "ready"}

    app.include_router(api_router)
    return app


app = create_app()
