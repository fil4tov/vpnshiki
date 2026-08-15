from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.auth.dependencies import CurrentAdmin, Database
from app.auth.models import AuthSession
from app.auth.security import hash_password
from app.errors import ApiError
from app.users.models import AccountStatus, User, UserRole
from app.users.schemas import AdminPasswordReset, AdminUserCreate, AdminUserUpdate, UserRead

router = APIRouter(prefix="/api/admin/users", tags=["admin"])


async def _get_user(db: Database, user_id: UUID) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise ApiError(status_code=404, code="user_not_found", message="Пользователь не найден")
    return user


async def _commit_unique(db: Database) -> None:
    try:
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(
            status_code=409,
            code="name_taken",
            message="Это имя уже занято",
            field_errors={"name": "Это имя уже занято"},
        ) from error


@router.get("", response_model=list[UserRead])
async def list_users(_admin: CurrentAdmin, db: Database) -> list[UserRead]:
    users = (await db.scalars(select(User).order_by(func.lower(User.name)))).all()
    return [UserRead.model_validate(user) for user in users]


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: AdminUserCreate, _admin: CurrentAdmin, db: Database
) -> UserRead:
    user = User(
        name=payload.name,
        password_hash=hash_password(payload.password),
        balance=payload.balance,
        negative_balance_limit=payload.negative_balance_limit,
        role=payload.role.value,
        account_status=payload.account_status.value,
    )
    db.add(user)
    await _commit_unique(db)
    await db.refresh(user)
    return UserRead.model_validate(user)


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: UUID,
    payload: AdminUserUpdate,
    _admin: CurrentAdmin,
    db: Database,
) -> UserRead:
    user = await _get_user(db, user_id)
    changes = payload.model_dump(exclude_unset=True)
    target_role = changes.get("role")
    if user.role == UserRole.ADMIN.value and target_role == UserRole.USER:
        admin_count = await db.scalar(
            select(func.count()).select_from(User).where(User.role == UserRole.ADMIN.value)
        )
        if admin_count == 1:
            raise ApiError(
                status_code=409,
                code="last_admin",
                message="Нельзя понизить роль последнего администратора",
            )
    for field, value in changes.items():
        setattr(user, field, value.value if isinstance(value, (AccountStatus, UserRole)) else value)
    await _commit_unique(db)
    await db.refresh(user)
    return UserRead.model_validate(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: UUID,
    admin: CurrentAdmin,
    db: Database,
) -> None:
    user = await _get_user(db, user_id)
    if user.id == admin.id:
        raise ApiError(
            status_code=409,
            code="cannot_delete_self",
            message="Нельзя удалить собственный аккаунт",
        )
    await db.execute(AuthSession.__table__.delete().where(AuthSession.user_id == user.id))
    await db.delete(user)
    await db.commit()


@router.post("/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(
    user_id: UUID,
    payload: AdminPasswordReset,
    _admin: CurrentAdmin,
    db: Database,
) -> None:
    user = await _get_user(db, user_id)
    user.password_hash = hash_password(payload.new_password)
    await db.flush()
    await db.execute(AuthSession.__table__.delete().where(AuthSession.user_id == user.id))
    await db.commit()
