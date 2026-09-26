"""Create an isolated schema, 10k-row hypertable and cagg; always remove own schema."""

from uuid import uuid4

from psycopg import sql

from scripts.common import connect, run


def main():
    schema = "cooked_smoke_" + uuid4().hex
    with connect(autocommit=True) as conn:
        print(
            "TimescaleDB",
            conn.execute(
                "SELECT extversion FROM pg_extension WHERE extname='timescaledb'"
            ).fetchone()[0],
        )
        conn.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        try:
            conn.execute(
                sql.SQL(
                    "CREATE TABLE {}.reading "
                    "(ts timestamptz NOT NULL, id int NOT NULL, value int, "
                    "PRIMARY KEY(ts,id))"
                ).format(sql.Identifier(schema))
            )
            conn.execute("SELECT create_hypertable(%s,'ts')", (f"{schema}.reading",))
            conn.execute(
                sql.SQL(
                    "INSERT INTO {}.reading SELECT "
                    "'2026-01-01'::timestamptz + i * INTERVAL '1 minute',i,i "
                    "FROM generate_series(1,10000) i"
                ).format(sql.Identifier(schema))
            )
            conn.execute(
                sql.SQL(
                    "CREATE MATERIALIZED VIEW {}.daily "
                    "WITH (timescaledb.continuous) AS SELECT "
                    "time_bucket(INTERVAL '1 day',ts) AS day,count(*) AS n "
                    "FROM {}.reading GROUP BY 1 WITH NO DATA"
                ).format(sql.Identifier(schema), sql.Identifier(schema))
            )
            conn.execute(
                "CALL refresh_continuous_aggregate(%s, NULL::timestamptz, NULL::timestamptz)",
                (f"{schema}.daily",),
            )
            count = conn.execute(
                sql.SQL("SELECT sum(n) FROM {}.daily").format(sql.Identifier(schema))
            ).fetchone()[0]
            if count != 10000:
                raise AssertionError("Continuous aggregate total does not match inserted rows")
            print("PASS: connected, inserted 10000 rows, refreshed aggregate; total=10000")
        finally:
            conn.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))
            print("Removed isolated smoke schema")


if __name__ == "__main__":
    run(main)
