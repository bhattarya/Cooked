"""Audit truth: every number the models produce for an UPLOADED audit equals what the batch
dataset path produces for the same person, and matches an independent pure-Python reference.

The reference below shares no code with api/profiles.py or ml/snapshots.py: it is written from the
definitions in db/03_features.sql (feat.person_term) and ml/snapshots.py's documented features.
"""

from __future__ import annotations

import math
import random

import numpy as np
import pandas as pd
import pytest

from api import profiles
from ml.snapshots import FEATURES, K_MAX, history_features, stage_features
from ml.twins import MIN_SUPPORT

# ---------------------------------------------------------------- independent reference
SEASON_RANK = {"Winter": 0, "Spring": 1, "Summer": 2, "Fall": 3}


def ref_rows(raw_terms: list[dict]) -> tuple[list[list[float]], int]:
    """raw_terms: [{'label': 'Fall 2023', 'courses': [(id, credits, grade), ...]}, ...] in ANY order.
    Returns ([[attempted, earned, W, F, repeats], ...] for completed Fall/Spring terms, gaps)."""

    def key(t):
        season, year = t["label"].split()
        return int(year) * 4 + SEASON_RANK[season]

    seen: set[str] = set()
    rows, idx = [], []
    for t in sorted(raw_terms, key=key):
        season, year = t["label"].split()
        graded = [c for c in t["courses"] if c[2] != "IP"]
        att = sum(c[1] for c in graded)
        earned = sum(c[1] for c in graded if c[2] not in ("W", "F"))
        w = sum(1 for c in graded if c[2] == "W")
        f = sum(1 for c in graded if c[2] == "F")
        rep = sum(1 for c in graded if c[0] in seen)
        seen.update(c[0] for c in t["courses"])
        if season in ("Fall", "Spring") and graded:
            rows.append([att, earned, w, f, rep])
            idx.append(int(year) * 2 + (season == "Fall"))
    gaps = (max(idx) - min(idx) + 1 - len(idx)) if idx else 0
    return rows, gaps


def ref_features(static: dict, rows: list[list[float]], k: int) -> dict[str, float]:
    r = rows[:k]
    f = {
        "entry_transfer": 1.0 if static["entry_type"] == "Transfer" else 0.0,
        "out_of_state": 1.0 if static["residency"] == "Out-of-State" else 0.0,
        "work_hours": float(static["work_hours"] or 0),
        "major_cs": 1.0 if static["major"] == "Computer Science" else 0.0,
        "k": float(k),
    }
    if not r:
        return {**f, **dict.fromkeys(("att_mean", "earned_mean", "att_min", "att_last", "low_share",
                                      "w_sum", "f_sum", "rep_sum", "earned_ratio"), 0.0)}
    n = len(r)
    att = [x[0] for x in r]
    ea = [x[1] for x in r]
    f.update(
        att_mean=sum(att) / n, earned_mean=sum(ea) / n, att_min=min(att), att_last=att[-1],
        low_share=sum(1 for a in att if a < 12) / n, w_sum=sum(x[2] for x in r),
        f_sum=sum(x[3] for x in r), rep_sum=sum(x[4] for x in r),
        earned_ratio=(sum(ea) / sum(att)) if sum(att) else 0.0,
    )
    return f


def ref_history(rows: list[list[float]], gaps: int) -> list[float]:
    if not rows:
        return [0.0, 0.0, 0.0, 0.0, float(gaps > 0)]
    n = len(rows)
    return [sum(x[0] for x in rows) / n, sum(1 for x in rows if x[0] < 12) / n,
            sum(x[2] for x in rows) / n, sum(x[4] for x in rows) / n, float(gaps > 0)]


# ---------------------------------------------------------------- unit tests (no database)
def audit(*terms):
    """terms: (label, [(course, credits, grade), ...]) -> AuditProfile"""
    return profiles.AuditProfile(
        terms=[{"label": lb, "courses": [{"course_id": c, "credits": cr, "grade": g} for c, cr, g in cs]}
               for lb, cs in terms])


def rows_of(p):
    rows, _, gaps = profiles.term_rows(p)
    return rows.tolist(), gaps


def test_golden_wf_repeat_and_order():
    # listed out of order on purpose; CMSC201 failed in Fall 2022 then repeated in Spring 2023
    p = audit(
        ("Spring 2023", [("CMSC201", 3, "B"), ("MATH151", 4, "W"), ("ENGL101", 3, "A")]),
        ("Fall 2022", [("CMSC201", 3, "F"), ("MATH151", 4, "C"), ("ENGL101", 3, "A"), ("HIST100", 3, "B")]),
    )
    rows, gaps = rows_of(p)
    assert rows[0] == [13.0, 10.0, 0.0, 1.0, 0.0]  # F earns nothing but still counts attempted
    # every course of Spring 2023 was already taken in Fall 2022 -> 3 repeats
    assert rows[1] == [10.0, 6.0, 1.0, 0.0, 3.0]
    assert gaps == 0
    assert rows == ref_rows([
        {"label": "Spring 2023", "courses": [("CMSC201", 3, "B"), ("MATH151", 4, "W"), ("ENGL101", 3, "A")]},
        {"label": "Fall 2022", "courses": [("CMSC201", 3, "F"), ("MATH151", 4, "C"), ("ENGL101", 3, "A"), ("HIST100", 3, "B")]},
    ])[0]


def test_summer_and_winter_are_not_rows_but_still_seed_repeats():
    p = audit(
        ("Fall 2022", [("CMSC201", 3, "A")]),
        ("Summer 2023", [("MATH151", 4, "B")]),
        ("Winter 2023", [("HIST100", 3, "B")]),
        ("Fall 2023", [("MATH151", 4, "A")]),  # repeats a Summer course
    )
    rows, gaps = rows_of(p)
    assert len(rows) == 2 and rows[1][4] == 1.0
    assert gaps == 1  # Spring 2023 was skipped between Fall 2022 and Fall 2023


def test_in_progress_never_leaks_into_features():
    p = audit(
        ("Fall 2022", [("CMSC201", 3, "A"), ("MATH151", 4, "B")]),
        ("Spring 2023", [("CMSC202", 3, "IP"), ("MATH152", 4, ""), ("ENGL101", 3, "ip")]),
    )
    rows, _ = rows_of(p)
    assert rows == [[7.0, 7.0, 0.0, 0.0, 0.0]]
    mixed = audit(("Fall 2022", [("CMSC201", 3, "A"), ("CMSC202", 3, "IP")]))
    assert rows_of(mixed)[0] == [[3.0, 3.0, 0.0, 0.0, 0.0]]


def test_transfer_blocks_are_not_terms():
    p = audit(("Transfer Credit", [("MATH140", 4, "A")]), ("Fall 2022", [("CMSC201", 3, "B")]))
    rows, _ = rows_of(p)
    assert rows == [[3.0, 3.0, 0.0, 0.0, 0.0]]


def test_plus_minus_grades():
    p = audit(("Fall 2022", [("CMSC201", 3, "B+"), ("MATH151", 4, "F"), ("ENGL101", 3, "D-"), ("HIST100", 3, "W")]))
    assert rows_of(p)[0] == [[13.0, 6.0, 1.0, 1.0, 0.0]]


def test_totals_only_terms_and_credits_earned_total():
    p = profiles.AuditProfile(terms=[
        {"label": "Fall 2022", "credits_attempted": 15, "credits_earned": 12, "withdrawals": 1},
        {"label": "Summer 2023", "courses": [{"course_id": "MATH151", "credits": 4, "grade": "B"}]},
    ])
    assert rows_of(p)[0] == [[15.0, 12.0, 1.0, 0.0, 0.0]]
    assert profiles.credits_earned_total(p) == 16  # summer credits count toward the degree


def test_unnamed_terms_keep_audit_order():
    p = audit(("Term 2", [("CMSC202", 3, "B")]), ("Term 1", [("CMSC201", 3, "A")]))
    rows, gaps = rows_of(p)
    assert len(rows) == 2 and gaps == 0


def test_reference_features_match_stage_features_on_random_histories():
    rng = random.Random(3)
    for _ in range(200):
        n = rng.randint(0, 9)
        rows = [[float(rng.choice([6, 9, 12, 15, 18])), 0.0, float(rng.randint(0, 2)),
                 float(rng.randint(0, 1)), float(rng.randint(0, 2))] for _ in range(n)]
        for r in rows:
            r[1] = max(r[0] - 3 * (r[2] + r[3]), 0)
        static = {"entry_type": rng.choice(["Transfer", "First-Time Freshman"]),
                  "residency": rng.choice(["In-State", "Out-of-State"]),
                  "work_hours": rng.choice([0, 10, 25]), "major": rng.choice(["Computer Science", "Information Systems"])}
        k = min(n, K_MAX)
        want = ref_features(static, rows, k)
        got = stage_features(pd.Series(static), np.array(rows, dtype=float).reshape(-1, 5), k)
        assert set(want) == set(FEATURES)
        for name in FEATURES:
            assert math.isclose(want[name], got[name], abs_tol=1e-9), name
        assert np.allclose(ref_history(rows, 1), history_features(np.array(rows, dtype=float).reshape(-1, 5), 1))


# ---------------------------------------------------------------- database-backed round trip
@pytest.fixture(scope="module")
def world():
    import os

    if not os.getenv("DATABASE_URL") or "CHANGE_ME" in os.getenv("DATABASE_URL", ""):
        pytest.skip("Configure a migrated, loaded DATABASE_URL to run database tests")
    from api.engine import get_engine
    from scripts.common import connect

    eng = get_engine()
    conn = connect()
    tx = pd.DataFrame(
        conn.execute("SELECT campus_id, term, course_id, credits_attempted, grade FROM feat.transcripts").fetchall(),
        columns=["cid", "term", "course", "credits", "grade"],
    )
    conn.close()
    by = {cid: g for cid, g in tx.groupby("cid", sort=False)}
    yield eng, by
    for pid in [i for i in eng.people.static.index if i.startswith("USR-TRUTH")]:
        eng.people.static.drop(pid, inplace=True)


def raw_of(g: pd.DataFrame) -> list[dict]:
    out = []
    for term, tg in g.groupby("term", sort=False):
        out.append({"label": term, "courses": [(r.course, int(r.credits), r.grade) for r in tg.itertuples()]})
    return out


def sample_ids(eng, population: str, n: int) -> list[str]:
    ids = sorted(eng.people.alumni_ids if population == "alumni" else eng.people.current_ids)
    rng = random.Random(11)
    flagged = [c for c in ids if len(eng.people.terms_of(c)) and (eng.people.terms_of(c)[:, 2:].sum() > 0)]
    return sorted(set(rng.sample(flagged, n // 2) + rng.sample(ids, n - n // 2)))


def make_profile(eng, by, cid: str, raw: list[dict], shuffle_seed: int):
    static = eng.people.static.loc[cid]
    raw = list(raw)
    random.Random(shuffle_seed).shuffle(raw)  # audits list terms in any order
    return profiles.AuditProfile(
        major=static["major"], track=static["track"], entry_type=static["entry_type"],
        residency=static["residency"], work_hours=int(static["work_hours"] or 0),
        terms=[{"label": t["label"], "courses": [{"course_id": c, "credits": cr, "grade": g} for c, cr, g in t["courses"]]}
               for t in raw],
    )


def test_50_alumni_round_trip_features_equal_batch_path(world):
    eng, by = world
    ids = sample_ids(eng, "alumni", 50)
    assert len(ids) == 50
    for i, cid in enumerate(ids):
        raw = raw_of(by[cid])
        prof = make_profile(eng, by, cid, raw, i)
        terms, _, gaps = profiles.term_rows(prof)
        batch = eng.people.terms_of(cid)
        assert terms.shape == batch.shape and np.array_equal(terms, batch), cid
        assert gaps == eng.people.gaps[cid], cid
        # independent reference agrees with both
        rrows, rgaps = ref_rows(raw)
        assert np.array_equal(np.array(rrows, dtype=float).reshape(-1, 5), batch), cid
        assert rgaps == eng.people.gaps[cid]
        static = eng.people.static.loc[cid].to_dict()
        for k in range(min(len(batch), 9) + 1):
            want = ref_features(static, rrows, min(k, K_MAX))
            got = stage_features(eng.people.static.loc[cid], terms, min(k, K_MAX))
            for name in FEATURES:
                assert math.isclose(want[name], got[name], abs_tol=1e-9), (cid, k, name)


def test_50_alumni_upload_path_equals_batch_scores(world):
    """A real upload of the first k terms of an alumnus must score exactly like the batch path."""
    eng, by = world
    ids = sample_ids(eng, "alumni", 50)
    rng = random.Random(5)
    for i, cid in enumerate(ids):
        raw = raw_of(by[cid])
        regular = sorted([t for t in raw if t["label"].split()[0] in ("Fall", "Spring")],
                         key=lambda t: (int(t["label"].split()[1]), SEASON_RANK[t["label"].split()[0]]))
        k = rng.randint(1, min(len(regular) - 1, 6)) if len(regular) > 1 else 1
        keep = {t["label"] for t in regular[:k]}
        last = regular[k - 1]["label"]
        y, s = int(last.split()[1]), last.split()[0]
        partial = [t for t in raw if t["label"] in keep or (
            t["label"].split()[0] in ("Summer", "Winter") and
            (int(t["label"].split()[1]), SEASON_RANK[t["label"].split()[0]]) < (y, SEASON_RANK[s]))]
        prof = make_profile(eng, by, cid, partial, i)
        pid = f"USR-TRUTH{i:04d}"
        profiles.register(eng.people, pid, prof)
        batch_terms = eng.people.terms_of(cid)[:k]
        assert np.array_equal(eng.people.terms_of(pid), batch_terms), (cid, k)
        st = eng.state(pid)
        # batch path for the same person at stage k
        s_row = eng.people.static.loc[cid]
        X = pd.DataFrame([stage_features(s_row, batch_terms, min(k, K_MAX))], columns=FEATURES)
        assert st["risk"]["value"] == round(float(eng.models.risk(X)[0]), 4)
        q = eng.models.ttd(X)[0]
        assert [st["time_to_degree"][x] for x in ("low", "mid", "high")] == [round(float(v), 2) for v in q]
        assert st["pattern"] == eng.models.pattern(batch_terms, ref_rows(partial)[1])
        tw = eng.index.find(stage_features(s_row, batch_terms, k), k)
        assert st["twins"]["n"] == tw.n and st["twins"]["ids"] == tw.ids, (cid, k)


def test_current_students_with_in_progress_round_trip(world):
    eng, by = world
    ids = sorted(eng.people.current_ids)[::max(1, len(eng.people.current_ids) // 40)][:40]
    for i, cid in enumerate(ids):
        raw = raw_of(by[cid])
        prof = make_profile(eng, by, cid, raw, 100 + i)
        prof.in_progress = [profiles.AuditCourse(course_id=c[0], credits=c[1], grade="IP")
                            for t in raw for c in t["courses"] if c[2] == "IP"]
        pid = f"USR-TRUTHC{i:03d}"
        profiles.register(eng.people, pid, prof)
        assert np.array_equal(eng.people.terms_of(pid), eng.people.terms_of(cid)), cid
        assert eng.people.gaps[pid] == eng.people.gaps.get(cid, 0), cid
        a, b = eng.state(pid), eng.state(cid)
        for key in ("risk", "time_to_degree", "pattern", "terms_done", "avg_credits", "w_total"):
            assert _strip(a[key]) == _strip(b[key]), (cid, key)
        assert a["twins"]["n"] == b["twins"]["n"] and a["twins"]["ids"] == b["twins"]["ids"]
        assert a["twins"]["smd"] == b["twins"]["smd"]
        assert (a["still_seeking_risk"] or {}).get("mid") == (b["still_seeking_risk"] or {}).get("mid")
        assert a["courses_in_progress"] == b["courses_in_progress"]


def _strip(v):
    return {k: x for k, x in v.items() if k != "tool_result_id"} if isinstance(v, dict) else v


def test_twin_gate_and_definitions(world):
    eng, _ = world
    cid = min(eng.people.current_ids)
    st = eng.state(cid)
    tw = st["twins"]
    if not tw["refused"]:
        assert tw["n"] >= MIN_SUPPORT and cid not in tw["ids"]
        assert all(eng.people.static.at[t, "population"] == "alumni" for t in tw["ids"])


# ---------------------------------------------------------------- new endpoints (BRIEF3)
@pytest.mark.db
def test_receipt_endpoint(db, engine_client):
    from api.engine import get_engine

    cid = get_engine().people.current_ids[0]
    r = engine_client.get(f"/profiles/{cid}/receipt")
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["campus_id"] == cid
    assert {f["name"] for f in data["features"]} == set(FEATURES)
    assert data["totals"]["terms_completed"] == len(get_engine().people.terms_of(cid))
    for f in data["features"]:
        assert f["tool_result_id"] == data["tool_result_id"]


@pytest.mark.db
def test_from_student_endpoint_matches_baseline_and_applies_overrides(db, engine_client):
    from api.engine import get_engine

    cid = get_engine().people.current_ids[0]
    r = engine_client.post("/model-lab/from-student", json={"student_id": cid})
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["derived_from"]["student_id"] == cid
    assert data["baseline"]["risk"] == data["risk"]  # no overrides -> baseline == result

    r2 = engine_client.post(
        "/model-lab/from-student", json={"student_id": cid, "overrides": {"work_hours": 45}}
    )
    data2 = r2.json()["data"]
    assert data2["scenario"]["work_hours"] == 45
    assert data2["baseline"]["risk"] == data["baseline"]["risk"]  # baseline unaffected by override
    assert data2["derived_from"] == data["derived_from"]


@pytest.mark.db
def test_from_student_unknown_student_is_not_found(db, engine_client):
    r = engine_client.post("/model-lab/from-student", json={"student_id": "CID-000000"})
    assert r.status_code == 404
