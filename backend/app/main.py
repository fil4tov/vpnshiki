import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.admin import router as admin_router
from app.auth import router as auth_router
from app.auth.dependencies import CurrentAdmin, Database
from app.billing.scheduler import BillingScheduler
from app.bootstrap import ensure_admin
from app.config import get_settings
from app.db import SessionFactory
from app.errors import ApiError
from app.payments.yoomoney import router as yoomoney_router
from app.payments.yoomoney.scheduler import YooMoneyReconciliationScheduler
from app.tariff_plans import router as tariff_plans_router
from app.users.router import router as users_router
from app.vpn_access import router as vpn_access_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    async with SessionFactory() as db:
        await ensure_admin(db, settings)
    scheduler = BillingScheduler(SessionFactory, settings)
    payment_scheduler = YooMoneyReconciliationScheduler(SessionFactory, settings)
    scheduler.start()
    payment_scheduler.start()
    try:
        yield
    finally:
        await payment_scheduler.stop()
        await scheduler.stop()


app = FastAPI(
    title="VPNщики API",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(admin_router)
app.include_router(tariff_plans_router)
app.include_router(vpn_access_router)
app.include_router(yoomoney_router)


@app.get("/api/openapi.json", include_in_schema=False)
async def openapi_schema(_admin: CurrentAdmin) -> JSONResponse:
    return JSONResponse(app.openapi(), headers={"Cache-Control": "no-store"})


@app.get("/api/docs", include_in_schema=False)
async def swagger_docs(_admin: CurrentAdmin) -> HTMLResponse:
    response = get_swagger_ui_html(
        openapi_url="/api/openapi.json",
        title=f"{app.title} — Swagger UI",
    )
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/redoc", include_in_schema=False)
async def redoc_docs(_admin: CurrentAdmin) -> HTMLResponse:
    response = get_redoc_html(
        openapi_url="/api/openapi.json",
        title=f"{app.title} — ReDoc",
    )
    response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(ApiError)
async def api_error_handler(_request: Request, error: ApiError) -> JSONResponse:
    response = JSONResponse(status_code=error.status_code, content=error.payload())
    response.headers["Cache-Control"] = "no-store"
    if error.clear_session:
        response.delete_cookie(get_settings().session_cookie_name, path="/api")
    return response


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(_request: Request, error: StarletteHTTPException) -> JSONResponse:
    code = "not_found" if error.status_code == 404 else "request_failed"
    message = "Не найдено" if error.status_code == 404 else str(error.detail)
    return JSONResponse(
        status_code=error.status_code,
        content={"code": code, "message": message},
        headers={"Cache-Control": "no-store"},
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(
    _request: Request, error: RequestValidationError
) -> JSONResponse:
    field_errors: dict[str, str] = {}
    for item in error.errors():
        location = item.get("loc", ())
        field = str(location[-1]) if location else "request"
        field_errors.setdefault(field, str(item.get("msg", "Некорректное значение")))
    return JSONResponse(
        status_code=422,
        content={
            "code": "validation_error",
            "message": "Проверьте заполненные поля",
            "field_errors": field_errors,
        },
        headers={"Cache-Control": "no-store"},
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(_request: Request, error: Exception) -> JSONResponse:
    logger.error("Unhandled API error", exc_info=(type(error), error, error.__traceback__))
    return JSONResponse(
        status_code=500,
        content={"code": "internal_error", "message": "Внутренняя ошибка сервера"},
        headers={"Cache-Control": "no-store"},
    )


@app.get("/api/health")
async def health(db: Database) -> dict[str, str]:
    await db.execute(text("SELECT 1"))
    return {"status": "ok"}
