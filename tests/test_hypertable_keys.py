import pytest


@pytest.mark.db
def test_hypertable_keys(db):
    dimensions = db.execute(
        "SELECT hypertable_schema,hypertable_name,column_name "
        "FROM timescaledb_information.dimensions WHERE hypertable_schema IN ('app','feat')"
    ).fetchall()
    assert len(dimensions) == 4
    for schema, table, time_column in dimensions:
        indexes = db.execute(
            """
            SELECT i.indexrelid::regclass::text, array_agg(a.attname)
            FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid
            JOIN pg_namespace n ON n.oid=t.relnamespace
            CROSS JOIN LATERAL unnest(i.indkey) AS k(attnum)
            JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum
            WHERE n.nspname=%s AND t.relname=%s AND i.indisunique
            GROUP BY i.indexrelid
        """,
            (schema, table),
        ).fetchall()
        assert indexes
        assert all(time_column in columns for _, columns in indexes)


@pytest.mark.db
def test_columnstore_and_continuous_aggregate(db):
    assert db.execute(
        "SELECT compression_enabled FROM timescaledb_information.hypertables "
        "WHERE hypertable_schema='app' AND hypertable_name='drill_trajectory'"
    ).fetchone()[0]
    assert (
        db.execute(
            "SELECT count(*) FROM timescaledb_information.continuous_aggregates "
            "WHERE view_schema='app' AND view_name='alarms_by_day_pattern'"
        ).fetchone()[0]
        == 1
    )
    assert (
        db.execute(
            "SELECT count(*) FROM timescaledb_information.jobs "
            "WHERE proc_name IN ('policy_compression','policy_refresh_continuous_aggregate')"
        ).fetchone()[0]
        >= 2
    )
