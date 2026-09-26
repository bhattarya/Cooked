"""Watchtower worker (§8.1): re-score every current student on a schedule and manage alarms.

Each pass writes one app.risk_snapshot row per student (a hypertable feeding the
risk_by_day_pattern continuous aggregate), opens alarms when risk crosses OPEN_AT, and resolves
them only below CLOSE_BELOW, so a hovering score never flaps.
"""

from __future__ import annotations

import json
import os
import signal
import threading
import time

from api.engine import model_dir
from ml.model_interface import Models
from ml.snapshots import load_people
from ml.watchtower import hysteresis, score_all
from scripts.common import connect

INTERVAL = int(os.getenv("WATCHTOWER_INTERVAL_SECONDS", "1800"))


def run_once() -> dict:
    models = Models.load(model_dir())
    with connect("DATABASE_URL_APP") as conn:
        people = load_people(conn)
        scores = score_all(people, models, min_terms=1)
        open_rows = dict(
            conn.execute("SELECT campus_id, id FROM app.alarm_event WHERE status='open'").fetchall()
        )
        with conn.cursor().copy(
            "COPY app.risk_snapshot (ts, campus_id, k_observed, risk, pattern, model_version) FROM STDIN"
        ) as cp:
            now = time.strftime("%Y-%m-%d %H:%M:%S+00", time.gmtime())
            for r in scores.itertuples():
                cp.write_row((now, r.campus_id, int(r.k), round(float(r.risk), 4), r.pattern, models.version))
        opened = resolved = 0
        for r in scores.itertuples():
            decision = hysteresis(r.campus_id in open_rows, float(r.risk))
            if decision == "open":
                conn.execute(
                    "INSERT INTO app.alarm_event(ts, campus_id, pattern, risk, lead_time_terms, lever, evidence) "
                    "VALUES (now(), %s, %s, %s, %s, %s, %s)",
                    (
                        r.campus_id, r.pattern or "none", round(float(r.risk), 4), int(r.lead_time_terms),
                        "average credits per term",
                        json.dumps({"model_version": models.version, "source": "watchtower"}),
                    ),
                )
                opened += 1
            elif decision == "resolve":
                conn.execute("UPDATE app.alarm_event SET status='resolved' WHERE id=%s", (open_rows[r.campus_id],))
                resolved += 1
    return {"scored": len(scores), "opened": opened, "resolved": resolved, "version": models.version}


def main():
    stopped = threading.Event()
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: stopped.set())
    once = os.getenv("WATCHTOWER_ONCE") == "1"
    while not stopped.is_set():
        try:
            result = run_once()
            print(
                f"Watchtower pass: scored {result['scored']}, opened {result['opened']}, "
                f"resolved {result['resolved']} ({result['version']})",
                flush=True,
            )
        except Exception as exc:  # noqa: BLE001 -- keep running; never log connection strings
            print(f"Watchtower pass failed ({type(exc).__name__}); retrying next interval", flush=True)
        if once:
            break
        stopped.wait(INTERVAL)


if __name__ == "__main__":
    main()
