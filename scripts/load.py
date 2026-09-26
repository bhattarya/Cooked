"""Download the pinned CC0 dataset, validate, then atomically COPY and derive features."""

import csv
import hashlib
import json
from pathlib import Path

import httpx
from psycopg import sql

from scripts.common import ROOT, connect, run

MANIFEST = json.loads((ROOT / "db/dataset.json").read_text())


def validate_file(path: Path, spec: dict):
    if hashlib.sha256(path.read_bytes()).hexdigest() != spec["sha256"]:
        raise ValueError("Dataset checksum mismatch")
    with path.open(newline="") as f:
        reader = csv.reader(f)
        if next(reader) != spec["columns"]:
            raise ValueError("Dataset header changed")
        if sum(1 for _ in reader) != spec["rows"]:
            raise ValueError("Dataset row count changed")


def fetch_files():
    directory = ROOT / "data/raw"
    directory.mkdir(parents=True, exist_ok=True)
    for name, spec in MANIFEST["files"].items():
        path = directory / f"{name}.csv"
        if not path.exists():
            url = (
                "https://raw.githubusercontent.com/jasonpaluck/hackumbc-2026/"
                f"{MANIFEST['commit']}/data/{name}.csv"
            )
            temp = path.with_suffix(".download")
            try:
                with httpx.stream("GET", url, timeout=120, follow_redirects=True) as response:
                    response.raise_for_status()
                    with temp.open("wb") as f:
                        for chunk in response.iter_bytes():
                            f.write(chunk)
                validate_file(temp, spec)
                temp.replace(path)
            finally:
                temp.unlink(missing_ok=True)
        validate_file(path, spec)
        print(f"Verified {name}: {spec['rows']} synthetic rows")
    return directory


def main():
    directory = fetch_files()
    with connect() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(20260926)")
        conn.execute("SET LOCAL ROLE owner")
        tables = [sql.Identifier("raw", n) for n in MANIFEST["files"]]
        conn.execute(sql.SQL("TRUNCATE {}, raw.load_manifest").format(sql.SQL(", ").join(tables)))
        for name, spec in MANIFEST["files"].items():
            command = sql.SQL("COPY {} ({}) FROM STDIN WITH (FORMAT CSV, HEADER TRUE)").format(
                sql.Identifier("raw", name),
                sql.SQL(", ").join(map(sql.Identifier, spec["columns"])),
            )
            with conn.cursor().copy(command) as copy, (directory / f"{name}.csv").open("rb") as f:
                while chunk := f.read(1024 * 1024):
                    copy.write(chunk)
            conn.execute(
                "INSERT INTO raw.load_manifest(table_name,dataset_commit,sha256,row_count) "
                "VALUES (%s,%s,%s,%s)",
                (name, MANIFEST["commit"], spec["sha256"], spec["rows"]),
            )
        conn.execute("SELECT feat.refresh_features()")
        from scripts.check_integrity import check

        check(conn)  # Roll back the ENTIRE reload if any integrity check fails.
    print("Dataset loaded; application events and caches preserved")


if __name__ == "__main__":
    run(main)
