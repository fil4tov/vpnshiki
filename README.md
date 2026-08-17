# VPNщики

Закрытое fullstack-приложение для общего VPN: участники видят баланс, суточное списание и свои VPN-подключения, а администраторы управляют аккаунтами и тарифными планами.

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

- приложение: `http://127.0.0.1:3001`;
- API: `http://127.0.0.1:3001/api`;
- Swagger для авторизованного администратора: `http://127.0.0.1:8000/api/docs`.

Первый администратор создаётся из `ADMIN_NAME` и `ADMIN_PASSWORD`, только если в базе ещё нет администратора. При существующем администраторе эти переменные не меняют его пароль.

Для блока «Ваш VPN» backend использует `X_UI_API_URL`, `X_UI_TOKEN` и
`X_UI_SUBSCRIPTION_URL`. Административный токен передаётся только от backend к 3X-UI и
никогда не включается в ответы браузеру. Все VPN-профили пользователя ищутся по email
`web-<логин>` и `web-<логин>-<устройство>`, например `web-moxxie-pc` и
`web-moxxie-mobile`. Сопоставление не зависит от регистра, но учитывает границу логина:
профиль `web-moxxie2-pc` не относится к пользователю `moxxie`. Старый формат
`[web]-<логин>` не поддерживается.

## Пополнение через YooMoney

Пополнение баланса работает через форму сбора денег YooMoney. Backend создаёт платёж,
а баланс меняется только после подписанного HTTP-уведомления или сверки истории операций.
Для включения задайте в `.env`:

```dotenv
YOOMONEY_ENABLED=true
YOOMONEY_RECEIVER=номер_именного_кошелька
YOOMONEY_NOTIFICATION_SECRET=секрет_HTTP_уведомлений
YOOMONEY_ACCESS_TOKEN=токен_с_правом_operation-history
YOOMONEY_RECONCILIATION_ENABLED=true
PUBLIC_APP_URL=https://публичный-домен-приложения
```

В настройках кошелька укажите HTTPS-адрес уведомлений
`https://публичный-домен-приложения/api/payments/yoomoney/webhook`. Номер кошелька,
секрет уведомлений и access token нельзя добавлять в репозиторий или frontend.

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

`pnpm test:e2e` поднимает отдельный Compose-проект `vpnshiki-e2e` на тестовых портах
вместе с локальным mock 3X-UI, запускает Playwright и затем удаляет контейнеры вместе с
тестовым volume PostgreSQL. Рабочая VPN-панель в E2E не используется.
Локальная база приложения при этом не используется. Для запуска Playwright против уже
подготовленного внешнего стенда используйте `pnpm test:e2e:direct` и переменные `E2E_BASE_URL`,
`E2E_ADMIN_NAME`, `E2E_ADMIN_PASSWORD`.

## CI/CD и деплой

При push в `main` workflow `.github/workflows/ci.yml`:

1. запускает lint, typecheck, unit- и E2E-тесты frontend;
2. запускает lint и тесты backend, включая PostgreSQL integration test;
3. собирает runtime-образы frontend и backend и публикует их в GHCR;
4. по SSH обновляет сервисы на сервере через `compose.yaml` и `compose.prod.yaml`.

В GitHub Environment `deploy` должны быть настроены secrets:

- `DEPLOY_HOST` — адрес сервера;
- `DEPLOY_USER` — SSH-пользователь;
- `DEPLOY_SSH_KEY` — приватный SSH-ключ;
- `DEPLOY_PORT` — SSH-порт;
- `DEPLOY_PATH` — каталог проекта на сервере.

В `DEPLOY_PATH` должны находиться актуальные `compose.yaml`, `compose.prod.yaml` и серверный
`.env` со всеми production-секретами. Для frontend задайте `FRONTEND_PORT=3001`.

Production Compose публикует frontend только на `127.0.0.1:3001`, поэтому внешний nginx
должен проксировать домен на `http://127.0.0.1:3001`. API отдельно наружу публиковать не
нужно: запросы `/api` frontend-контейнер передаёт backend по внутренней Docker-сети.
