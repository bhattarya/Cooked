"""Dependency health; missing model artifacts are explicitly a placeholder."""

from api.cache import check_cache
from scripts.common import connect


def dependency_status() -> dict:
    checks = {
        "database": "unavailable",
        "artifact_checksum": "not_configured",
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
