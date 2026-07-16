from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    environment: str = "development"
    log_level: str = "INFO"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/personalized_learning"
    supabase_url: str | None = None
    supabase_jwks_url: str | None = None
    supabase_issuer: str | None = None
    supabase_audience: str | None = None
    openai_api_key: str | None = Field(default=None, repr=False)
    openai_model: str = "gpt-5.6"
    openai_moderation_model: str = "omni-moderation-latest"
    frontend_url: str = "http://localhost:5173"
    demo_mode: bool = False

    @field_validator("environment")
    @classmethod
    def validate_environment(cls, value: str) -> str:
        if value not in {"development", "test", "staging", "production"}:
            raise ValueError("environment must be development, test, staging, or production")
        return value

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, value: str) -> str:
        if value.startswith("postgres://"):
            return "postgresql+psycopg://" + value.removeprefix("postgres://")
        if value.startswith("postgresql://"):
            return "postgresql+psycopg://" + value.removeprefix("postgresql://")
        return value

    def validate_production(self) -> None:
        if self.environment != "production":
            return
        required = {"DATABASE_URL": self.database_url, "SUPABASE_JWKS_URL": self.supabase_jwks_url, "SUPABASE_ISSUER": self.supabase_issuer, "SUPABASE_AUDIENCE": self.supabase_audience}
        absent = [name for name, value in required.items() if not value]
        if absent:
            raise RuntimeError(f"Missing required production configuration: {', '.join(absent)}")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.validate_production()
    return settings
