import pytest
from fastapi.testclient import TestClient

from api.main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "0")
    return TestClient(app)


def test_mocks_are_explicit_and_do_not_invent_predictions(client):
    response = client.get("/students/CID-116490/state")
    assert response.status_code == 200
    body = response.json()
    assert body["mock"] is True
    assert body["data"]["delay"] is None
    assert response.cookies["cooked_session"]


def test_invalid_input_has_one_error_shape(client):
    response = client.post("/alarms/1/feedback", json={"useful": True, "reason": "x" * 121})
    assert response.status_code == 422
    assert set(response.json()) == {"error", "message", "needs"}
    assert "x" * 121 not in response.text
    assert client.post("/drill", json={}).status_code == 422


def test_health_failure_is_not_healthy(client, monkeypatch):
    monkeypatch.setattr(
        "api.main.dependency_status",
        lambda: {
            "database": "unavailable",
            "artifact_checksum": "not_configured",
            "cache": "unavailable",
        },
    )
    assert client.get("/healthz").status_code == 503


@pytest.mark.db
def test_health_with_database(db, client):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["checks"] == {
        "database": "ok",
        "artifact_checksum": "not_configured",
        "cache": "ok",
    }


def test_demo_replay_is_explicitly_unimplemented(client, monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "1")
    response = client.get("/myths")
    assert response.status_code == 503
    assert response.json()["error"] == "cache_replay_not_implemented"
