import json

import pytest

from ml.snapshots import load_people, training_frame
from scripts.common import ROOT, connect


@pytest.mark.db
def test_no_current_student_in_any_training_set(db):
    with connect("DATABASE_URL_APP") as conn:
        people = load_people(conn)
    current = set(people.current_ids)
    frozen = set(json.loads((ROOT / "models/training_ids.json").read_text()))
    assert frozen and not frozen & current
    for k in (0, 1, 3):
        ids = set(training_frame(people, k).ids)
        assert ids and not ids & current
        assert people.static.loc[list(ids), "population"].eq("alumni").all()
