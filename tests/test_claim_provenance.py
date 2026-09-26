import pytest

from api import provenance


@pytest.fixture
def slots():
    tr = provenance.record("unit_tool", {"x": 1})
    return {"t1": ("66", tr), "t2": ("7.5", tr)}


def test_valid_script_becomes_traced_segments(slots):
    segs = provenance.fill("Among {{t1}} students the load was {{t2}} credits.", slots, {"t1", "t2"})
    assert segs is not None
    check = provenance.check(segs)
    assert check["ok"] and check["tokens"] == 2


@pytest.mark.parametrize(
    "text",
    [
        "Among {{t1}} students, 42 percent struggled at {{t2}}.",  # a number the model wrote itself
        "Among {{t1}} students at {{t3}}.",  # unknown slot
        "Among {{t1}} students.",  # required slot missing
    ],
)
def test_untraceable_numbers_are_rejected(text, slots):
    assert provenance.fill(text, slots, {"t1", "t2"}) is None


def test_unknown_tool_result_ids_fail_the_check():
    check = provenance.check([{"value": "12", "tool_result_id": "tr_notreal000"}])
    assert not check["ok"] and check["unknown"] == ["tr_notreal000"]


@pytest.mark.db
def test_every_number_in_served_narration_maps_to_a_tool_result(db, engine_client):
    for kind in ("alarm", "drill", "repair"):
        body = engine_client.post("/narrate", json={"kind": kind, "campus_id": "CID-137153"}).json()
        segs = body["data"]["segments"]
        assert provenance.check(segs)["ok"], kind
        for s in segs:
            if "value" in s:
                assert provenance.lookup(s["tool_result_id"]) is not None
