import pytest

GOLDEN = ["CID-137153", "CID-449005", "CID-104853", "CID-137373", "CID-116770"]


@pytest.mark.db
@pytest.mark.parametrize("cid", GOLDEN)
def test_drill_and_repair_are_deterministic(db, engine_client, cid):
    def once():
        d = engine_client.post("/drill", json={"campus_id": cid}).json()["data"]
        r = engine_client.post("/repair", json={"campus_id": cid}).json()["data"]
        return (
            d["shocks_to_cooked"],
            [(p["shock"], round(p["risk_after"], 6)) for p in d["path"]],
            [p["survival"] for p in d["survival"]],
            r["primary"] and (r["primary"]["target"], r["primary"]["support"]),
        )

    assert once() == once()


@pytest.mark.db
def test_drill_trajectories_land_in_timescale(db, engine_client):
    d = engine_client.post("/drill", json={"campus_id": "CID-449005"}).json()["data"]
    s = engine_client.get(f"/drill/{d['drill_id']}/survival").json()["data"]
    assert d["rows_stored"] > 0 and s["source"] == "timescale"
    assert [round(p["survival"], 3) for p in s["points"]] == [round(p["survival"], 3) for p in d["survival"]]
