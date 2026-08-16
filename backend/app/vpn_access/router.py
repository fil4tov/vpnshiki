from fastapi import APIRouter, Response

from app.auth.dependencies import CurrentUser
from app.errors import ApiError
from app.users.models import AccountStatus

from .dependencies import XuiProvider
from .schemas import VpnAccessRead

router = APIRouter(prefix="/api/users/me", tags=["vpn-access"])


@router.get("/vpn", response_model=VpnAccessRead)
async def read_vpn_access(
    response: Response,
    user: CurrentUser,
    provider: XuiProvider,
) -> VpnAccessRead:
    if user.account_status != AccountStatus.ACTIVE.value:
        raise ApiError(
            status_code=403,
            code="vpn_access_inactive",
            message="VPN доступен только для активного аккаунта",
        )
    result = await provider.fetch_access(f"web-{user.name}")
    response.headers["Cache-Control"] = "no-store"
    return result
