import pytest
from fastapi.testclient import TestClient

from api.main import app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("DEMO_MODE", "0")
    return TestClient(app)


@pytest.mark.db
def test_state_is_real_and_every_number_is_traced(db, engine_client):
    response = engine_client.get("/students/CID-137153/state")
    assert response.status_code == 200
    body = response.json()
    assert body["mock"] is False and body["model_version"].startswith("cooked-v1")
    data = body["data"]
    assert 0 <= data["risk"]["value"] <= 1 and data["risk"]["tool_result_id"].startswith("tr_")
    assert data["delay"]["low"] <= data["delay"]["mid"] <= data["delay"]["high"]
    assert response.cookies["cooked_session"]


def test_unknown_student_is_not_found(client, monkeypatch):
    class Fake:
        version = "x"

        def state(self, *a):
            from api.engine import NotFound

            raise NotFound("x")

    monkeypatch.setattr("api.routes.product.get_engine", lambda: Fake())
    response = client.get("/students/CID-000001/state")
    assert response.status_code == 404 and set(response.json()) == {"error", "message", "needs"}


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
        "artifact_checksum": "ok",
        "cache": "ok",
    }
    assert response.json()["mode"] == "models"


def test_models_not_ready_is_an_explicit_503(client, monkeypatch):
    from api.engine import NotReady

    def not_ready():
        raise NotReady("models_not_ready", "Model artifacts are not available.", ["run: make train"])

    monkeypatch.setattr("api.routes.product.get_engine", not_ready)
    response = client.get("/myths")
    assert response.status_code == 503 and response.json()["error"] == "models_not_ready"
