from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = (
        "postgresql+asyncpg://vpnshiki:vpnshiki_dev_password@postgres:5432/vpnshiki"
    )
    session_cookie_name: str = "vpnshiki_session"
    session_days: int = Field(default=30, ge=1, le=365)
    cookie_secure: bool = False
    admin_name: str | None = None
    admin_password: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()

