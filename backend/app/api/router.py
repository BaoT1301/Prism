from fastapi import APIRouter

from app.api.routes.profiles import router as profiles_router
from app.api.routes.domain import router as domain_router
from app.api.routes.personalization import router as personalization_router
from app.api.routes.sessions import router as sessions_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(profiles_router)
api_router.include_router(domain_router)
api_router.include_router(personalization_router)
api_router.include_router(sessions_router)
