from helpers import make_people

from ml.snapshots import stage_features
from ml.twins import MIN_SUPPORT, TwinIndex


def _find(people):
    s = people.static.loc["CID-000001"]
    t = people.terms_of("CID-000001")
    return TwinIndex(people).find(stage_features(s, t, len(t)), len(t))


def test_fewer_than_thirty_twins_is_a_refusal():
    result = _find(make_people(MIN_SUPPORT - 10))
    assert result.refused and result.ids == []


def test_enough_balanced_twins_are_returned_with_support():
    result = _find(make_people(80))
    assert not result.refused
    assert result.n >= MIN_SUPPORT and len(result.ids) == result.n
    assert all(v < 0.1 for v in result.smd.values())


def test_profile_outside_training_range_is_refused():
    people = make_people(80, work=10)
    people.static.loc["CID-000001", "work_hours"] = 60
    result = _find(people)
    assert result.refused and "outside the training range" in result.reason
