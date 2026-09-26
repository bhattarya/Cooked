import pytest

from api.providers import net


@pytest.mark.db
def test_demo_routes_work_with_outbound_network_disabled(db, engine_client, monkeypatch):
    def boom(*a, **k):
        raise AssertionError("outbound network used in demo mode")

    monkeypatch.setenv("DEMO_MODE", "1")
    monkeypatch.setattr(net.httpx, "Client", boom)
    assert not net.enabled()
    assert engine_client.get("/healthz").json()["demo_mode"] is True
    for path in ("/students/CID-137153/state", "/institution/queue", "/myths"):
        assert engine_client.get(path).status_code == 200, path
    body = engine_client.post("/narrate", json={"kind": "alarm", "campus_id": "CID-137153"}).json()
    assert body["data"]["source"] in {"template", "cache"} and body["data"]["provenance"]["ok"]
    assert engine_client.post("/drill", json={"campus_id": "CID-137153"}).status_code == 200
