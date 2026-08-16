from uuid import UUID

from fastapi import APIRouter, status

from app.auth.dependencies import CurrentAdmin, Database

from .schemas import (
    TariffPlanBillingRunRead,
    TariffPlanCreate,
    TariffPlanRead,
    TariffPlanUpdate,
)
from .service import (
    create_tariff_plan,
    delete_tariff_plan,
    list_tariff_plan_billing_runs,
    list_tariff_plans,
    update_tariff_plan,
)

router = APIRouter(prefix="/api/admin/tariff-plans", tags=["admin", "tariff-plans"])


@router.get("", response_model=list[TariffPlanRead])
async def list_plans(_admin: CurrentAdmin, db: Database) -> list[TariffPlanRead]:
    return await list_tariff_plans(db)


@router.get("/{plan_id}/billing-history", response_model=list[TariffPlanBillingRunRead])
async def list_plan_billing_history(
    plan_id: UUID,
    _admin: CurrentAdmin,
    db: Database,
) -> list[TariffPlanBillingRunRead]:
    return await list_tariff_plan_billing_runs(db, plan_id)


@router.post("", response_model=TariffPlanRead, status_code=status.HTTP_201_CREATED)
async def create_plan(
    payload: TariffPlanCreate, _admin: CurrentAdmin, db: Database
) -> TariffPlanRead:
    return await create_tariff_plan(db, payload.monthly_amount, payload.start_date)


@router.patch("/{plan_id}", response_model=TariffPlanRead)
async def update_plan(
    plan_id: UUID,
    payload: TariffPlanUpdate,
    _admin: CurrentAdmin,
    db: Database,
) -> TariffPlanRead:
    return await update_tariff_plan(
        db,
        plan_id,
        monthly_amount=payload.monthly_amount,
        start_date=payload.start_date,
    )


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan(plan_id: UUID, _admin: CurrentAdmin, db: Database) -> None:
    await delete_tariff_plan(db, plan_id)
