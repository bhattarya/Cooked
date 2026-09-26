"""Fire drill (§7.6): shocks observed in the data, re-scored with the frozen risk model.

Greedy adversarial search finds the shortest plausible shock sequence that pushes the student's
risk past the threshold; the Monte Carlo companion draws shocks at their measured per-term rates.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ml.model_interface import Models
from ml.shocks import band
from ml.snapshots import FEATURES, K_MAX, People, stage_features

MAX_SHOCKS = 4
P_MIN = 0.05
FIRST_FUTURE = 2026 * 2 + 1  # Fall 2026 (in progress) as term_idx


def term_label(i: int) -> str:
    idx = FIRST_FUTURE + i
    return f"{'Fall' if idx % 2 else 'Spring'} {idx // 2}"


def _row(static, terms: np.ndarray, work: float) -> dict:
    s = static.copy()
    s["work_hours"] = work
    return stage_features(s, terms, min(len(terms), K_MAX))


def _shock_terms(load: float) -> dict[str, np.ndarray]:
    return {
        "normal": np.array([load, load, 0, 0, 0], dtype=float),
        "withdraw": np.array([load, max(load - 3, 0), 1, 0, 1], dtype=float),
        "lighter": np.array([max(load - 3, 0), max(load - 3, 0), 0, 0, 0], dtype=float),
    }


SHOCKS = {
    "withdraw": ("Withdraw and repeat", "+1 W and a repeat, 3 credits not earned"),
    "lighter": ("Forced lighter load", "3 fewer credits attempted"),
}


def run_drill(people: People, models: Models, cid: str, plan_load: float, work: float) -> dict:
    static = people.static.loc[cid]
    base = people.terms_of(cid)
    k0 = len(base)
    rates = models.shocks
    b = band(work)
    probs = {"withdraw": rates["withdraw"][b], "lighter": rates["lighter_load"][b]}
    kinds = _shock_terms(plan_load)
    horizon = max(0, K_MAX - k0)

    def score(future: list[np.ndarray]) -> tuple[float, float]:
        terms = np.vstack([base, *future]) if future else base
        X = pd.DataFrame([_row(static, terms, work)], columns=FEATURES)
        return float(models.risk(X)[0]), float(models.ttd(X)[0, 1])

    risk_now, ttd_now = score([])
    if horizon == 0:
        return {
            "stage_limited": True,
            "risk_now": risk_now,
            "baseline_risk": risk_now,
            "path": [],
            "shocks_to_cooked": 0 if risk_now >= models.threshold else None,
            "single_point_of_failure": None,
            "probs": probs,
        }

    future = [kinds["normal"]]
    baseline_risk, baseline_ttd = score(future)
    path = []
    cur = baseline_risk
    future = []
    if baseline_risk < models.threshold:
        for step in range(min(MAX_SHOCKS, horizon)):
            best = None
            for key, p in probs.items():
                if p < P_MIN:
                    continue
                r, t = score([*future, kinds[key]])
                if best is None or r > best[1] or (r == best[1] and p > probs[best[0]]):
                    best = (key, r, t)
            if best is None:
                break
            key, r, t = best
            future.append(kinds[key])
            label, detail = SHOCKS[key]
            path.append(
                {
                    "term": term_label(step),
                    "shock": key,
                    "label": label,
                    "detail": detail,
                    "prob": probs[key],
                    "risk_before": cur,
                    "risk_after": r,
                    "ttd_median_after": t,
                    "cooked": r >= models.threshold,
                }
            )
            cur = r
            if r >= models.threshold:
                break
    broke = baseline_risk >= models.threshold or (path and path[-1]["cooked"])
    spof = max(path, key=lambda s: s["risk_after"] - s["risk_before"]) if path else None
    return {
        "stage_limited": False,
        "risk_now": risk_now,
        "baseline_risk": baseline_risk,
        "baseline_ttd_median": baseline_ttd,
        "path": path,
        "shocks_to_cooked": (0 if baseline_risk >= models.threshold else len(path)) if broke else None,
        "single_point_of_failure": spof["label"] if spof else None,
        "joint_probability": float(np.prod([s["prob"] for s in path])) if path else None,
        "probs": probs,
        "ttd_now_median": ttd_now,
    }


def monte_carlo(
    people: People, models: Models, cid: str, plan_load: float, work: float, sims: int = 200,
    seed: int = 7,
) -> dict:
    """Simulate `sims` futures to the model horizon; returns per-sim, per-term rows."""
    static = people.static.loc[cid]
    base = people.terms_of(cid)
    k0 = len(base)
    horizon = max(0, K_MAX - k0)
    b = band(work)
    pw, pl = models.shocks["withdraw"][b], models.shocks["lighter_load"][b]
    rng = np.random.default_rng(seed + int(plan_load * 31) + int(work))
    futures: list[list[np.ndarray]] = [[] for _ in range(sims)]
    cooked = np.zeros(sims, dtype=bool)
    credits = np.full(sims, float(base[:, 1].sum()) if k0 else 0.0)
    wcum = np.full(sims, float(base[:, 2].sum()) if k0 else 0.0)
    rows = []
    survival = [{"term_k": 0, "survival": 1.0}]
    for t in range(1, horizon + 1):
        w = rng.random(sims) < pw
        drop = rng.random(sims) < pl
        shocks = []
        for i in range(sims):
            att = max(plan_load - (3 if drop[i] else 0), 0)
            earned = max(att - (3 if w[i] else 0), 0)
            futures[i].append(np.array([att, earned, int(w[i]), 0, int(w[i])], dtype=float))
            credits[i] += earned
            wcum[i] += int(w[i])
            shocks.append("withdraw" if w[i] else "lighter" if drop[i] else None)
        X = pd.DataFrame(
            [_row(static, np.vstack([base, *futures[i]]), work) for i in range(sims)],
            columns=FEATURES,
        )
        cooked |= models.risk(X) >= models.threshold
        survival.append({"term_k": t, "survival": round(float(1 - cooked.mean()), 4)})
        rows.extend(
            (i, t, int(credits[i]), int(wcum[i]), shocks[i], bool(cooked[i])) for i in range(sims)
        )
    return {"horizon": horizon, "survival": survival, "rows": rows, "sims": sims}
