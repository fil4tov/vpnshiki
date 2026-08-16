from pydantic import BaseModel


class VpnProfileRead(BaseModel):
    name: str
    protocol: str
    transport: str | None
    security: str | None
    url: str


class VpnAccessRead(BaseModel):
    subscription_url: str
    profiles: list[VpnProfileRead]
