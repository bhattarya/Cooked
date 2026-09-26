"""Executable §6.6 checks; errors roll back a load and fail CI."""

import json

from psycopg import sql

from scripts.common import ROOT, connect, run


def check(conn):
    specs = json.loads((ROOT / "db/dataset.json").read_text())["files"]
    for name, spec in specs.items():
        count = conn.execute(
            sql.SQL("SELECT count(*) FROM {}").format(sql.Identifier("raw", name))
        ).fetchone()[0]
        if count != spec["rows"]:
            raise AssertionError(f"Row count mismatch: raw.{name}")
        print(f"PASS raw.{name}: {count}")
    checks = {
        "disjoint populations": "SELECT count(*) FROM raw.alumni JOIN raw.students_current USING(campus_id)",
        "5000 unique people": "SELECT abs(count(*)-5000) FROM feat.person_static",
        "no current labels": "SELECT count(*) FROM feat.person_static WHERE population='current' "
        "AND (cooked IS NOT NULL OR mode IS NOT NULL OR graduation_year IS NOT NULL)",
        "regular term dates": "SELECT count(*) FROM feat.person_term "
        "WHERE to_char(term_start,'MM-DD') NOT IN ('01-15','08-25')",
        "employment end dates": "SELECT count(*) FROM feat.employment_history "
        "WHERE (end_date IS NULL) IS DISTINCT FROM is_current",
        "completed feature terms": "SELECT count(*) FROM feat.person_term p WHERE NOT EXISTS ("
        "SELECT 1 FROM raw.transcripts t WHERE t.campus_id=p.campus_id "
        "AND t.grade <> 'IP' AND t.term = "
        "CASE WHEN extract(month FROM p.term_start)=8 THEN 'Fall ' "
        "ELSE 'Spring ' END || extract(year FROM p.term_start)::text)",
        "complete alumni labels": "SELECT count(*) FROM feat.person_static "
        "WHERE population='alumni' AND cooked IS NULL",
        "no orphan transcripts": "SELECT count(*) FROM raw.transcripts t LEFT JOIN "
        "feat.person_static s USING(campus_id) WHERE s.campus_id IS NULL",
        "no orphan courses": "SELECT count(*) FROM raw.transcripts t LEFT JOIN "
        "raw.course_catalog c USING(course_id) WHERE c.course_id IS NULL",
    }
    for label, query in checks.items():
        if conn.execute(query).fetchone()[0] != 0:
            raise AssertionError(label)
        print(f"PASS {label}")


def main():
    with connect() as conn:
        check(conn)


if __name__ == "__main__":
    run(main)
