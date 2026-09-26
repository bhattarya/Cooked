"""Repair (§7.7): what matched students who escaped did differently, checked against the catalog.

Everything here is associational: "matched students who did this", never "this will work".
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

from ml.fire_drill import _row
from ml.model_interface import Models
from ml.snapshots import FEATURES, People, stage_features
from ml.twins import MIN_SUPPORT, TwinIndex

NEXT_TERM = ("Spring 2027", "Spring")
BOOT = 300


def _future_load(people: People, cid: str, k: int) -> float | None:
    t = people.terms_of(cid)[k:]
    return float(t[:, 0].mean()) if len(t) else None


def _boot_ci(lo: np.ndarray, hi: np.ndarray, seed: int) -> tuple[float, float]:
    rng = np.random.default_rng(seed)
    d = [
        np.median(rng.choice(lo, len(lo))) - np.median(rng.choice(hi, len(hi)))
        for _ in range(BOOT)
    ]
    return float(np.quantile(d, 0.05)), float(np.quantile(d, 0.95))


def _lever(people: People, pool: list[str], k: int, target: int, label: str) -> dict | None:
    loads = {c: _future_load(people, c, k) for c in pool}
    hi = [c for c, v in loads.items() if v is not None and v >= target - 0.5]
    lo = [c for c, v in loads.items() if v is not None and v < target - 0.5]
    if len(hi) < MIN_SUPPORT or len(lo) < 10:
        return None
    ttd = people.static["ttd"]
    t_hi, t_lo = ttd.loc[hi].to_numpy(), ttd.loc[lo].to_numpy()
    diff = float(np.median(t_lo) - np.median(t_hi))
    ci = _boot_ci(t_lo, t_hi, target)
    if diff <= 0 or ci[0] <= 0:  # the interval must exclude zero (§7.7)
        return None
    return {
        "lever": "credits_per_term",
        "title": f"Hold {target}+ credits a term",
        "target": target,
        "diff_years": diff,
        "ci90": ci,
        "support": len(hi),
        "cooked_rate_at_target": float(people.static.loc[hi, "cooked"].mean()),
        "pool": label,
    }


def _text(v) -> str:
    """NULL catalog cells arrive as None or NaN; treat both as empty."""
    return v if isinstance(v, str) else ""


def feasibility(people: People, cid: str, major: str, target: int) -> dict:
    cat = people.catalog
    have = set(people.courses_done.get(cid, set())) | set(people.courses_ip.get(cid, []))

    def groups(pre):
        pre = _text(pre)
        return [] if not pre else [g.split(" or ") for g in pre.split("|")]

    def prereq_ok(course_id):
        return all(any(p.strip() in have for p in g) for g in groups(cat.at[course_id, "prerequisite_ids"]))

    def for_major(course_id):
        return major in _text(cat.at[course_id, "required_for_majors"]).split("|")

    subject = "CMSC" if major == "Computer Science" else "IS"

    def rank(course_id):
        if for_major(course_id):
            return 0
        if cat.at[course_id, "course_type"] == "Elective" and cat.at[course_id, "subject"] == subject:
            return 1
        return 2 if cat.at[course_id, "course_type"] == "General Education" else 3

    offered = [
        c
        for c in cat.index
        if c not in have and prereq_ok(c) and NEXT_TERM[1] in _text(cat.at[c, "typical_terms_offered"])
    ]
    picks, credits = [], 0
    for c in sorted(offered, key=lambda c: (rank(c), c)):
        if credits >= target or rank(c) == 3:
            continue
        picks.append({"course_id": c, "title": cat.at[c, "course_title"], "credits": int(cat.at[c, "credits"])})
        credits += int(cat.at[c, "credits"])
    blocked = [c for c in cat.index if for_major(c) and c not in have and not prereq_ok(c)]
    required_open = [c for c in offered if rank(c) == 0]
    return {
        "term": NEXT_TERM[0],
        "feasible": credits >= target,
        "target": target,
        "picks": picks,
        "blocked": blocked,
        "reasons": [
            f"{len(required_open)} required courses open in {NEXT_TERM[0]}",
            f"{len(offered)} courses with prerequisites met and offered",
            f"{len(blocked)} major courses still blocked by prerequisites",
        ],
    }


def run_repair(
    people: People, models: Models, index: TwinIndex, cid: str, twin_ids: list[str], work: float
) -> dict:
    static = people.static.loc[cid]
    base = people.terms_of(cid)
    k = len(base)
    current = round(float(base[:, 0].mean())) if k else 15
    extra = people.current_extra.loc[cid]
    remaining = max(0, int(extra["credits_required"]) - int(extra["credits_earned"]))
    need = math.ceil(remaining / max(1, 10 - k))
    start = max(current + 1, min(need, 17))

    with_future = [c for c in twin_ids if len(people.terms_of(c)) > k]
    work_pool = [
        c
        for c in people.alumni_ids
        if people.static.at[c, "entry_type"] == static["entry_type"]
        and abs((people.static.at[c, "work_hours"] or 0) - work) <= 5
        and len(people.terms_of(c)) > k
    ]
    pools = [(with_future, "matched students"), (work_pool, "students at your work hours")]

    primary = None
    for pool, label in pools:
        for target in range(start, 18):
            primary = _lever(people, pool, k, target, label)
            if primary:
                break
        if primary:
            break
    if primary is None:  # no load gets under five years with support: best supported gain
        best = None
        for pool, label in pools:
            for target in range(current + 1, 17):
                lev = _lever(people, pool, k, target, label)
                if lev and (best is None or lev["diff_years"] > best["diff_years"]):
                    best = lev
            if best:
                break
        primary = best

    if primary:
        # what the frozen model says after two terms at the target load (not a promise)
        def model_risk(load):
            fut = np.array([[load, load, 0, 0, 0]] * 2, dtype=float)
            terms = np.vstack([base, fut]) if k else fut
            return float(models.risk(pd.DataFrame([_row(static, terms, work)], columns=FEATURES))[0])

        primary["model_risk_now_pace"] = model_risk(current)
        primary["model_risk_at_target"] = model_risk(primary["target"])
        primary["reaches_five_years"] = primary["target"] >= need
        primary["feasibility"] = feasibility(people, cid, static["major"], primary["target"])

    fallback = None
    if work >= 10:
        lower = max(0.0, work - 10)
        s = static.copy()
        s["work_hours"] = lower
        alt = index.find(stage_features(s, base, k), k)
        if not alt.refused:
            now = people.static.loc[twin_ids]
            then = people.static.loc[alt.ids]
            drop = float(now["cooked"].mean() - then["cooked"].mean())
            diff = float(now["ttd"].median() - then["ttd"].median())
            if drop >= 0.1 and diff > 0.2:
                fallback = {
                    "lever": "work_hours",
                    "title": f"Cut work to about {int(lower)} h/week",
                    "target": lower,
                    "diff_years": diff,
                    "support": alt.n,
                    "cooked_rate_at_target": float(then["cooked"].mean()),
                    "pool": "students matched at fewer hours",
                }
    refusal = None if primary or fallback else "No change has enough matched students behind it."
    return {"primary": primary, "fallback": fallback, "refusal": refusal, "current_load": current}
