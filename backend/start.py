import os
import subprocess


def main() -> None:
    subprocess.run(["alembic", "upgrade", "head"], check=True)
    os.execvpe(
        "uvicorn",
        ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"],
        os.environ,
    )


if __name__ == "__main__":
    main()
