FROM ghcr.io/astral-sh/uv:0.8.15 AS uv

FROM python:3.13-slim AS build
COPY --from=uv /uv /uvx /bin/
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.13-slim AS runtime
WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
COPY --from=build /app/.venv /app/.venv
COPY alembic.ini ./
COPY start.py ./
COPY migrations ./migrations
COPY app ./app
EXPOSE 8000
CMD ["python", "start.py"]

FROM python:3.13-slim AS test
COPY --from=uv /uv /uvx /bin/
WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --all-groups --no-install-project
COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app
COPY tests ./tests
RUN find app migrations tests -type f -exec chmod a-x {} +
CMD ["python", "-m", "pytest"]
