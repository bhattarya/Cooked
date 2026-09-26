"""Environment loading and credential-safe CLI errors."""

import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(os.getenv("COOKED_ENV_FILE", ROOT / ".env"), override=False)


def required(name: str) -> str:
    value = os.getenv(name, "")
    if not value or "CHANGE_ME" in value or "@HOST" in value:
        raise RuntimeError(f"Configure {name} in your ignored .env or environment")
    return value


def connect(name: str = "DATABASE_URL", **kwargs):
    return psycopg.connect(required(name), connect_timeout=5, **kwargs)


def run(main):
    try:
        main()
    except Exception as exc:  # noqa: BLE001 -- credential-safe boundary for CLIs
        # Provider and DB exceptions can contain connection strings, headers or body text.
        print(
            f"FAILED ({type(exc).__name__}); check configuration and service access. "
            "Sensitive error details suppressed."
        )
        raise SystemExit(1) from None
