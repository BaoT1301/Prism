import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.models import UserRole


class ProfileBootstrapRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)
    role: UserRole


class ProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    auth_user_id: uuid.UUID
    email: str
    display_name: str
    role: UserRole
    created_at: datetime
