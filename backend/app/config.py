from functools import lru_cache
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, model_validator
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
    yoomoney_enabled: bool = False
    yoomoney_receiver: str | None = None
    yoomoney_notification_secret: SecretStr | None = None
    yoomoney_access_token: SecretStr | None = None
    yoomoney_reconciliation_enabled: bool = True
    public_app_url: str | None = None
    tg_notification_url: str | None = Field(
        default=None,
        validation_alias="TG_NOTIFICATION_URL",
    )
    tg_notification_token: SecretStr | None = Field(
        default=None,
        validation_alias="TG_NOTIFICATION_TOKEN",
    )

    @model_validator(mode="after")
    def validate_yoomoney(self) -> "Settings":
        if not self.yoomoney_enabled:
            return self
        notification_secret = (
            self.yoomoney_notification_secret.get_secret_value()
            if self.yoomoney_notification_secret is not None
            else ""
        )
        access_token = (
            self.yoomoney_access_token.get_secret_value()
            if self.yoomoney_access_token is not None
            else ""
        )
        missing = [
            name
            for name, value in (
                ("YOOMONEY_RECEIVER", self.yoomoney_receiver),
                ("YOOMONEY_NOTIFICATION_SECRET", notification_secret),
                ("PUBLIC_APP_URL", self.public_app_url),
            )
            if not value
        ]
        if self.yoomoney_reconciliation_enabled and not access_token:
            missing.append("YOOMONEY_ACCESS_TOKEN")
        if missing:
            raise ValueError(f"Не заданы настройки YooMoney: {', '.join(missing)}")
        if self.yoomoney_receiver is None or not self.yoomoney_receiver.isdigit():
            raise ValueError("YOOMONEY_RECEIVER должен содержать только цифры")
        if not 11 <= len(self.yoomoney_receiver) <= 20:
            raise ValueError("YOOMONEY_RECEIVER должен содержать от 11 до 20 цифр")
        if self.public_app_url is None or not self.public_app_url.startswith("https://"):
            raise ValueError("PUBLIC_APP_URL должен быть публичным HTTPS-адресом")
        self.public_app_url = self.public_app_url.rstrip("/")
        return self

    @model_validator(mode="after")
    def validate_telegram_notifications(self) -> "Settings":
        url = (self.tg_notification_url or "").strip()
        token = (
            self.tg_notification_token.get_secret_value().strip()
            if self.tg_notification_token is not None
            else ""
        )
        if bool(url) != bool(token):
            raise ValueError(
                "TG_NOTIFICATION_URL и TG_NOTIFICATION_TOKEN должны быть заданы вместе"
            )
        if url:
            parsed_url = urlsplit(url)
            if parsed_url.scheme.lower() not in {"http", "https"} or not parsed_url.hostname:
                raise ValueError("TG_NOTIFICATION_URL должен быть HTTP(S)-адресом")
        self.tg_notification_url = url or None
        self.tg_notification_token = SecretStr(token) if token else None
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
