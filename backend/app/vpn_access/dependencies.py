from typing import Annotated

from fastapi import Depends

from app.config import get_settings

from .service import XuiClient


def get_xui_client() -> XuiClient:
    return XuiClient(get_settings())


XuiProvider = Annotated[XuiClient, Depends(get_xui_client)]
