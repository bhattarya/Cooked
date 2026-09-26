from collections import defaultdict
from datetime import date

import pytest


@pytest.mark.db
def test_features_match_completed_regular_transcripts(db):
    expected = defaultdict(lambda: [0, 0, 0, 0, 0])
    for campus, term, attempted, earned, grade, repeat in db.execute(
        "SELECT campus_id,term,credits_attempted,credits_earned,grade,is_repeat FROM raw.transcripts"
    ):
        season, year = term.split()
        if season not in ("Fall", "Spring") or grade == "IP":
            continue
        start = date(int(year), 8, 25) if season == "Fall" else date(int(year), 1, 15)
        values = expected[campus, start]
        for i, value in enumerate(
            (int(attempted), int(earned), grade == "W", grade == "F", repeat == "TRUE")
        ):
            values[i] += value
    actual = db.execute(
        "SELECT campus_id,term_start,term_idx,k,credits_attempted,credits_earned,"
        "w_count,f_count,repeat_count FROM feat.person_term ORDER BY campus_id,term_start"
    ).fetchall()
    assert expected, "Load the dataset before running feature tests"
    assert len(actual) == len(expected)
    ordinal = defaultdict(int)
    for campus, start, term_idx, k, *values in actual:
        ordinal[campus] += 1
        assert k == ordinal[campus]
        assert term_idx == 2 * start.year + (start.month == 8)
        assert values == expected[campus, start]
