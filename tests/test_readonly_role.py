import pytest
from psycopg.errors import (
    InsufficientPrivilege,
    ObjectNotInPrerequisiteState,
    ReadOnlySqlTransaction,
)

from scripts.common import connect


@pytest.mark.db
def test_readonly_role(db):
    with connect("DATABASE_URL_AGENT", autocommit=True) as conn:
        assert conn.execute("SHOW statement_timeout").fetchone()[0] == "3s"
        assert conn.execute("SHOW default_transaction_read_only").fetchone()[0] == "on"
        assert conn.execute("SELECT count(*) FROM v.student_state").fetchone()[0] == 5000
        assert conn.execute(
            "SELECT terms_done,w_total FROM v.student_state WHERE terms_done=0 LIMIT 1"
        ).fetchone() == (0, 0)
        for query in (
            "SELECT * FROM raw.alumni LIMIT 1",
            "SELECT * FROM feat.person_static LIMIT 1",
            "SELECT * FROM app.voice_clip LIMIT 1",
            "SELECT feat.refresh_features()",
            "SET ROLE owner",
            "SET ROLE app_rw",
        ):
            with pytest.raises(InsufficientPrivilege):
                conn.execute(query)
        # ACLs must protect writes even when the user disables the read-only default.
        conn.execute("SET default_transaction_read_only=off")
        for privilege in ("INSERT", "UPDATE", "DELETE"):
            assert not conn.execute(
                "SELECT has_table_privilege(current_user,'v.student_state',%s)", (privilege,)
            ).fetchone()[0]
        # PostgreSQL rejects non-updatable views before checking DELETE privileges.
        with pytest.raises((InsufficientPrivilege, ObjectNotInPrerequisiteState)):
            conn.execute("DELETE FROM v.student_state")
        for query in (
            "INSERT INTO app.feedback(useful) VALUES(true)",
            "CREATE TABLE v.should_not_exist(id int)",
            "CREATE TABLE public.should_not_exist(id int)",
            "CREATE TEMP TABLE should_not_exist(id int)",
        ):
            with pytest.raises((InsufficientPrivilege, ReadOnlySqlTransaction)):
                conn.execute(query)


@pytest.mark.db
def test_app_role(db):
    with connect("DATABASE_URL_APP") as conn:
        assert conn.execute("SELECT count(*) FROM feat.person_static").fetchone()[0] == 5000
        conn.execute("INSERT INTO app.feedback(useful) VALUES(true)")
        conn.rollback()
        with pytest.raises(InsufficientPrivilege):
            conn.execute("SELECT * FROM raw.alumni LIMIT 1")
        conn.rollback()
