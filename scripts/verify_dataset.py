"""Prove COOKED runs on the official HackUMBC 2026 dataset: python -m scripts.verify_dataset

Downloads each CSV from github.com/jasonpaluck/hackumbc-2026 at the pinned commit, checks its
SHA-256, header and row count against db/dataset.json, compares with the local copy the app
loads (data/raw), and reports whether the pinned commit is still the repository's HEAD.
Needs only network access: no database, no keys.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json

import httpx

from scripts.common import ROOT, run

REPO = "https://github.com/jasonpaluck/hackumbc-2026"


def main():
    manifest = json.loads((ROOT / "db/dataset.json").read_text())
    commit = manifest["commit"]
    print(f"Dataset: {REPO} @ {commit}")
    ok = True
    with httpx.Client(timeout=120, follow_redirects=True) as client:
        head = client.get("https://api.github.com/repos/jasonpaluck/hackumbc-2026/commits/HEAD")
        if head.is_success:
            latest = head.json()["sha"]
            print(f"Upstream HEAD: {latest[:12]} ({'same as pinned' if latest == commit else 'NEWER than pinned: review before re-pinning'})")
        for name, spec in manifest["files"].items():
            url = f"https://raw.githubusercontent.com/jasonpaluck/hackumbc-2026/{commit}/data/{name}.csv"
            data = client.get(url).content
            digest = hashlib.sha256(data).hexdigest()
            rows = list(csv.reader(io.StringIO(data.decode("utf-8"))))
            header_ok = rows[0] == spec["columns"]
            count_ok = len(rows) - 1 == spec["rows"]
            local = ROOT / f"data/raw/{name}.csv"
            local_ok = local.exists() and hashlib.sha256(local.read_bytes()).hexdigest() == digest
            good = digest == spec["sha256"] and header_ok and count_ok
            ok &= good
            print(
                f"  {'PASS' if good else 'FAIL'} {name + '.csv':<24} {len(rows) - 1:>7,} rows  sha256 {digest[:16]}…"
                f"  local copy: {'identical' if local_ok else 'missing or different (run make load)'}"
            )
    if not ok:
        raise SystemExit("Dataset verification failed")
    print("All six files match the official dataset byte for byte.")


if __name__ == "__main__":
    run(main)
