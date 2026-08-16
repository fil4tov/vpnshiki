from functools import lru_cache

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", populate_by_name=True)

    database_url: str = (
        "postgresql+asyncpg://vpnshiki:vpnshiki_dev_password@postgres:5432/vpnshiki"
    )
    session_cookie_name: str = "vpnshiki_session"
    session_days: int = Field(default=30, ge=1, le=365)
    cookie_secure: bool = False
    admin_name: str | None = None
    admin_password: str | None = None
    x_ui_api_url: str | None = Field(default=None, validation_alias="X_UI_API_URL")
    x_ui_token: SecretStr | None = Field(default=None, validation_alias="X_UI_TOKEN")
    x_ui_subscription_url: str | None = Field(
        default="https://85.208.87.191:8888/gatewaysubru",
        validation_alias="X_UI_SUBSCRIPTION_URL",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
