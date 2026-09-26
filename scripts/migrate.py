"""Apply checksummed SQL migrations once; provision app credentials from env URLs."""

import hashlib
import re

from psycopg import sql
from psycopg.conninfo import conninfo_to_dict

from scripts.common import ROOT, connect, required, run


def role_connections():
    admin = conninfo_to_dict(required("DATABASE_URL"))
    result = {}
    for role, var in (("app_rw", "DATABASE_URL_APP"), ("agent_ro", "DATABASE_URL_AGENT")):
        cfg = conninfo_to_dict(required(var))
        if cfg.get("user") != role or not cfg.get("password"):
            raise ValueError(f"{var} must contain the {role} login and password")
        for key, default in (("host", ""), ("port", "5432"), ("dbname", "")):
            if cfg.get(key, default) != admin.get(key, default):
                raise ValueError("All database URLs must target the same database")
        result[role] = cfg
    return result


def secure_roles(conn, configs):
    conn.execute("RESET ROLE")
    for role, cfg in configs.items():
        flags = conn.execute(
            "SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls "
            "FROM pg_roles WHERE rolname = %s",
            (role,),
        ).fetchone()
        memberships = conn.execute(
            "SELECT count(*) FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member "
            "WHERE r.rolname=%s",
            (role,),
        ).fetchone()[0]
        if any(flags) or memberships:
            raise RuntimeError(
                "App roles already have elevated privileges; use a dedicated database"
            )
        # Send a SCRAM verifier, not the plaintext password, to SQL/server logs.
        verifier = conn.pgconn.encrypt_password(
            cfg["password"].encode(), role.encode(), b"scram-sha-256"
        ).decode()
        conn.execute(
            sql.SQL("ALTER ROLE {} LOGIN NOINHERIT PASSWORD {}").format(
                sql.Identifier(role), sql.Literal(verifier)
            )
        )
    conn.execute("ALTER ROLE agent_ro SET statement_timeout = '3s'")
    conn.execute("ALTER ROLE agent_ro SET default_transaction_read_only = on")
    conn.execute("ALTER ROLE agent_ro SET search_path = v, pg_catalog")
    conn.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
    conn.execute(
        sql.SQL("REVOKE TEMPORARY ON DATABASE {} FROM PUBLIC").format(
            sql.Identifier(conn.info.dbname)
        )
    )
    conn.execute(
        sql.SQL("GRANT CONNECT ON DATABASE {} TO app_rw, agent_ro").format(
            sql.Identifier(conn.info.dbname)
        )
    )


def main():
    configs = role_connections()
    with connect(autocommit=True) as conn:
        conn.execute("SELECT pg_advisory_lock(20260926)")
        try:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS public.cooked_migration "
                "(name text PRIMARY KEY, sha256 text NOT NULL, "
                "applied_at timestamptz NOT NULL DEFAULT now())"
            )
            conn.execute("REVOKE ALL ON public.cooked_migration FROM PUBLIC")
            for path in sorted((ROOT / "db").glob("[0-9][0-9]_*.sql")):
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                row = conn.execute(
                    "SELECT sha256 FROM public.cooked_migration WHERE name=%s", (path.name,)
                ).fetchone()
                if row:
                    if row[0] != digest:
                        raise RuntimeError("Applied migration changed; add a new migration instead")
                    print(f"Already applied: {path.name}")
                    continue
                print(f"Applying: {path.name}")
                with conn.transaction():
                    if not path.name.startswith("00_"):
                        conn.execute("SET LOCAL ROLE owner")
                    conn.execute(path.read_text(), prepare=False)
                    conn.execute("RESET ROLE")
                    version = conn.execute(
                        "SELECT extversion FROM pg_extension WHERE extname='timescaledb'"
                    ).fetchone()[0]
                    parts = tuple(map(int, re.match(r"(\d+)\.(\d+)", version).groups()))
                    if parts < (2, 18):
                        raise RuntimeError("TimescaleDB 2.18+ required for columnstore SQL")
                    conn.execute(
                        "INSERT INTO public.cooked_migration(name,sha256) VALUES (%s,%s)",
                        (path.name, digest),
                    )
            with conn.transaction():
                secure_roles(conn, configs)
            print("Migrations and role credentials configured")
            print(
                "TimescaleDB:",
                conn.execute(
                    "SELECT extversion FROM pg_extension WHERE extname='timescaledb'"
                ).fetchone()[0],
            )
        finally:
            conn.execute("SELECT pg_advisory_unlock(20260926)")


if __name__ == "__main__":
    run(main)
