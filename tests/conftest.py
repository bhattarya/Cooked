import os

import pytest

from scripts.common import connect


@pytest.fixture
def db():
    if not os.getenv("DATABASE_URL") or "CHANGE_ME" in os.getenv("DATABASE_URL", ""):
        if os.getenv("CI") or os.getenv("REQUIRE_DB_TESTS") == "1":
            pytest.fail("Database integration tests are required but DATABASE_URL is missing")
        pytest.skip("Configure a migrated, loaded DATABASE_URL to run database tests")
    conn = connect()
    yield conn
    conn.rollback()
    conn.close()


@pytest.fixture
def engine_client(monkeypatch):
    """API client over the real models; needs a migrated, loaded DB and models/."""
    from fastapi.testclient import TestClient

    from api.main import app
    from api.providers import net

    monkeypatch.setenv("DEMO_MODE", "0")
    # tests never call paid providers (Gemini, ElevenLabs, Backboard): deterministic and free,
    # and they exercise the same fallbacks a keyless deployment uses
    net.allow(False)
    try:
        with TestClient(app) as client:
            yield client
    finally:
        net.allow(True)
