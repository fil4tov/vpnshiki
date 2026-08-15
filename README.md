# VPNщики

Закрытое fullstack-приложение для общего VPN: участники видят баланс и управляют участием, администраторы создают аккаунты и управляют их состоянием. Первая итерация намеренно не содержит тарификацию и интеграцию с 3x-ui.

## Стек

- Frontend: React 19, TypeScript, Vite, React Router, TanStack Query, React Hook Form, Zustand, SCSS Modules.
- Backend: Python 3.13, FastAPI, SQLAlchemy asyncio, Alembic, Argon2.
- Инфраструктура: PostgreSQL 17, Docker Compose, Nginx.
- Тесты: pytest, Vitest, Testing Library, Playwright.

## Запуск через Docker

```bash
cp .env.example .env
# Обязательно замените ADMIN_PASSWORD и POSTGRES_PASSWORD.
docker compose up --build -d
```

После запуска:

- приложение: `http://127.0.0.1`;
- API: `http://127.0.0.1/api`;
- Swagger: `http://127.0.0.1:8000/docs`.

Первый администратор создаётся из `ADMIN_NAME` и `ADMIN_PASSWORD`, только если в базе ещё нет администратора. При существующем администраторе эти переменные не меняют его пароль.

## Локальная разработка

```bash
docker compose up -d postgres
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Для локального backend задайте `DATABASE_URL`, `ADMIN_NAME` и `ADMIN_PASSWORD`. В другом терминале:

```bash
cd frontend
corepack enable
pnpm install
pnpm dev
```

Vite проксирует `/api` на `http://127.0.0.1:8000`.

## Проверки

```bash
cd backend
uv run ruff check .
uv run pytest

cd ../frontend
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

