"""The audit-free charts must be computable from the pinned synthetic dataset."""

from api import provenance
from api.explore import QUERIES, _spoken_rows


def test_cohort_queries_and_missing_destination_rule(db):
    results = {}
    for topic, sql in QUERIES.items():
        cur = db.execute(sql)
        names = [column.name for column in cur.description]
        results[topic] = [dict(zip(names, row)) for row in cur.fetchall()]
        assert results[topic], topic
        assert all(row["value"] is not None for row in results[topic]), topic

    assert sum(row["n"] for row in results["work"]) == 3200
    assert sum(row["n"] for row in results["destinations"]) == 3200
    assert next(row["n"] for row in results["destinations"] if row["label"] == "No Response") == 480
    assert sum(row["unknown"] for row in results["internships"]) == 480
    assert sum(row["n"] for row in results["internships"]) == 2720

    tr = provenance.record("cohort_explore_test", {})
    for topic, rows in results.items():
        assert provenance.check(_spoken_rows(topic, rows, tr))["ok"], topic
