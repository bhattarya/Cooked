"""Dependency health: database, voice cache and the frozen model artifacts."""

import os

from api.cache import check_cache
from ml.model_interface import ArtifactError, verify
from scripts.common import connect


def database_kind() -> str:
    """Which Postgres serves the app: only the kind, never the host or credentials."""
    from urllib.parse import urlsplit

    host = urlsplit(os.getenv("DATABASE_URL_APP", "")).hostname or ""
    if not host:
        return "unknown"
    if "tsdb.cloud.timescale.com" in host or "timescale" in host or "tigerdata" in host:
        return "tiger-cloud"
    return "timescaledb-local" if host in {"localhost", "127.0.0.1", "db"} else "unknown"


def artifact_status() -> str:
    from api.engine import model_dir

    try:
        verify(model_dir())
        return "ok"
    except ArtifactError as exc:
        return "not_configured" if str(exc) == "not_configured" else "mismatch"


def dependency_status() -> dict:
    checks = {
        "database": "unavailable",
        "artifact_checksum": artifact_status(),
        "cache": "unavailable",
    }
    try:
        with connect("DATABASE_URL_APP", options="-c statement_timeout=1500") as conn:
            conn.execute("SELECT 1").fetchone()
            checks["database"] = "ok"
            checks["cache"] = check_cache(conn)
    except Exception:  # noqa: BLE001 -- public health must never expose DB details
        # Never return a DB exception/DSN to an anonymous caller or logs.
        return checks
    return checks
