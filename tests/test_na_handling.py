import json

import pytest
from psycopg import sql

from scripts.common import ROOT


@pytest.mark.db
def test_na_handling(db):
    manifest = json.loads((ROOT / "db/dataset.json").read_text())
    sentinels = 0
    for table, spec in manifest["files"].items():
        for column in spec["columns"]:
            raw = db.execute(
                sql.SQL(
                    "SELECT count(*) FROM {} WHERE {} = 'Not Applicable' OR {} IS NULL OR {} = ''"
                ).format(sql.Identifier("raw", table), *[sql.Identifier(column)] * 3)
            ).fetchone()[0]
            typed = db.execute(
                sql.SQL("SELECT count(*) FROM {} WHERE {} IS NULL").format(
                    sql.Identifier("feat", table), sql.Identifier(column)
                )
            ).fetchone()[0]
            assert typed == raw, (table, column)
            sentinels += raw
    assert sentinels > 0
    assert (
        db.execute(
            "SELECT count(*) FROM feat.employment_history "
            "WHERE (end_date IS NULL) IS DISTINCT FROM is_current"
        ).fetchone()[0]
        == 0
    )
    # A real categorical response must survive cleaning (not unemployment or NULL).
    assert (
        db.execute(
            "SELECT count(*) FROM feat.alumni WHERE first_destination='No Response'"
        ).fetchone()[0]
        > 0
    )
