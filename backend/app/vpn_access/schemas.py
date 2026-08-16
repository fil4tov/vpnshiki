from pydantic import BaseModel


class VpnConnectionRead(BaseModel):
    name: str
    protocol: str
    transport: str | None
    security: str | None
    url: str


class VpnClientProfileRead(BaseModel):
    email: str
    label: str
    subscription_url: str
    connections: list[VpnConnectionRead]


class VpnAccessRead(BaseModel):
    profiles: list[VpnClientProfileRead]
