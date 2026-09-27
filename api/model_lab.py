"""Interactive model lab: the arena's four tasks scoring one synthetic scenario.

The scenario is turned into the same per-term records the models were trained on (see
`_history`), so the sliders never produce a combination the data cannot: credits are only lost
to withdrawn or failed courses, and a lost course is retaken the next term. The champion model of
each task answers; the other three families answer beside it (`candidates`), and `drivers` says
which inputs move the risk, by re-scoring the scenario one input at a time.
"""

from __future__ import annotations

import json
import threading
from collections import OrderedDict
from dataclasses import dataclass

import numpy as np
import pandas as pd

from api.engine import Engine, NotReady
from api.schemas import FromStudentRequest, ModelLabRequest
from ml.candidates import FAMILY_LABELS, KINDS
from ml.outcomes import scenario_outcome_features
from ml.snapshots import ATT, EARNED, FEATURES, K_MAX, REP, F, W, history_features, stage_features

CACHE_SIZE = 256
MIN_DRIVER_SHIFT = 0.0005  # smaller than a twentieth of a percentage point is not a driver
TOP_DRIVERS = 4
TASK_NAMES = {
    "risk": "Academic risk",
    "time_to_degree": "Graduation timeline",
    "career": "Career destination",
    "salary": "First salary range",
}
DRIVER_LABELS = {
    "work_hours": "Weekly work hours",
    "credits_per_term": "Credits per term",
    "withdrawals": "Withdrawals",
    "failures": "Failed courses",
    "earned_ratio": "Credits completed",
    "entry_type": "Entry type",
    "residency": "Residency",
    "major": "Major",
}
DRIVERS_BASIS = (
    "Each driver is set to the typical alumnus value (median, or most common category) one at "
    "a time while the rest of the scenario stays as it is. The shift is the change in the "
    "champion risk model's probability. Interactions between inputs are not separated."
)
DISCLAIMER = (
    "Synthetic planning scenario. Career and salary estimates use a completed-profile "
    "scenario; observed associations are not causal promises."
)


@dataclass
class Context:
    """Facts about the training population, computed once per engine from the data."""

    engine: Engine
    ranges: dict[str, tuple[float, float]]  # what the models have seen; inputs are clipped to it
    reference: dict[str, float | str]  # the typical alumnus, for `drivers`
    credits_per_lost_course: int
    constellation: list[dict]
    lock: threading.Lock
    cache: OrderedDict


_contexts: dict[int, Context] = {}
_contexts_lock = threading.Lock()


def _context(engine: Engine) -> Context:
    with _contexts_lock:
        ctx = _contexts.get(id(engine))
        if ctx is None or ctx.engine is not engine:
            ctx = _build_context(engine)
            _contexts[id(engine)] = ctx
        return ctx


def _build_context(engine: Engine) -> Context:
    people = engine.people
    alumni = people.static.loc[people.alumni_ids]
    out = people.alumni_out.loc[people.alumni_ids]
    terms = np.vstack([people.terms_of(c) for c in people.alumni_ids])
    lost_courses = terms[:, W] + terms[:, F]
    lost_credits = terms[:, ATT] - terms[:, EARNED]
    per_course = lost_credits[lost_courses > 0] / lost_courses[lost_courses > 0]

    def span(values) -> tuple[float, float]:
        return float(np.min(values)), float(np.max(values))

    ranges = {
        "work_hours": span(alumni["work_hours"].fillna(0)),
        "internship_count": span(out["internship_count"].fillna(0)),
        "credential_count": span(out["credential_count"].fillna(0)),
        "engagement_count": span(out["engagement_count"].fillna(0)),
    }
    reference = {
        "work_hours": float(alumni["work_hours"].fillna(0).median()),
        "credits_per_term": float(np.median(terms[:, ATT])),
        "withdrawals": 0.0,
        "failures": 0.0,
        "earned_ratio": 1.0,
        "entry_type": str(alumni["entry_type"].mode().iloc[0]),
        "residency": str(alumni["residency"].mode().iloc[0]),
        "major": str(alumni["major"].mode().iloc[0]),
    }

    autopsy = engine.models.autopsy
    ids = people.alumni_ids
    history = np.array([history_features(people.terms_of(c), people.gaps.get(c, 0)) for c in ids])
    coords = autopsy["pca"].transform(autopsy["scaler"].transform(history))
    stride = max(1, len(ids) // 320)
    constellation = [
        {
            "x": round(float(coords[i, 0]), 3),
            "y": round(float(coords[i, 1]), 3),
            "pattern": autopsy["labels"][ids[i]],
        }
        for i in range(0, len(ids), stride)
    ][:360]
    return Context(
        engine=engine,
        ranges=ranges,
        reference=reference,
        credits_per_lost_course=max(1, round(float(np.mean(per_course)))),
        constellation=constellation,
        lock=threading.Lock(),
        cache=OrderedDict(),
    )


def _clip(ctx: Context, body: ModelLabRequest) -> tuple[ModelLabRequest, list[str]]:
    """Inputs beyond the training range are held at its edge (trees do this implicitly; linear
    models would extrapolate). The names that were held are returned so the UI can say so."""
    values, clipped = body.model_dump(), []
    for name, (lo, hi) in ctx.ranges.items():
        if not lo <= values[name] <= hi:
            values[name] = int(min(max(values[name], lo), hi))
            clipped.append(name)
    return ModelLabRequest(**values), clipped


def _history(ctx: Context, body: ModelLabRequest, **override) -> tuple[np.ndarray, dict]:
    """Six regular terms of history: the completed ones as described, then clean ones.

    In the data credits are only ever lost to withdrawn or failed courses (a fixed number of
    credits each) and a lost course is retaken the following term. So a completed-credits share
    below 100% that the withdrawal and failure counts do not already explain is counted as
    further withdrawals, the far more common of the two. Projected terms (after the completed
    ones) repeat the credit load with no new withdrawals or failures.
    """
    p = {**body.model_dump(), **override}
    done, per = p["completed_terms"], p["credits_per_term"]
    lost_credit = ctx.credits_per_lost_course
    withdrawals, failures = int(p["withdrawals"]), int(p["failures"])
    if done:
        implied = round(done * per * (1 - p["earned_ratio"]) / lost_credit)
        withdrawals += max(0, implied - withdrawals - failures)
    w_by_term, f_by_term = np.zeros(K_MAX), np.zeros(K_MAX)
    for i in range(withdrawals if done else 0):
        w_by_term[i % done] += 1
    for i in range(failures if done else 0):
        f_by_term[i % done] += 1
    lost = w_by_term + f_by_term
    terms = np.zeros((K_MAX, 5))
    terms[:, ATT] = per
    terms[:, EARNED] = np.maximum(per - lost_credit * lost, 0)
    terms[:, W], terms[:, F] = w_by_term, f_by_term
    terms[1:, REP] = lost[:-1]  # a lost course is retaken the following term
    attempted = per * done
    return terms, {
        "withdrawals": int(w_by_term.sum()),
        "failures": int(f_by_term.sum()),
        "earned_ratio": round(float(terms[:done, EARNED].sum() / attempted), 4) if done else 1.0,
        "credits_per_lost_course": lost_credit,
    }


def _static(body: ModelLabRequest, **override) -> pd.Series:
    p = {**body.model_dump(), **override}
    return pd.Series(
        {
            "entry_type": p["entry_type"],
            "residency": p["residency"],
            "work_hours": p["work_hours"],
            "major": p["major"],
        }
    )


def _features(body: ModelLabRequest, terms: np.ndarray, k: int, **override) -> dict:
    return stage_features(_static(body, **override), terms[:k], k)


def _drivers(ctx: Context, body: ModelLabRequest, risk: float) -> list[dict]:
    """The inputs moving the risk: the scenario re-scored with each input at its typical value."""
    models, k = ctx.engine.models, body.completed_terms
    values = body.model_dump()
    rows, names = [], []
    for name, reference in ctx.reference.items():
        if values[name] == reference:
            continue
        terms, _ = _history(ctx, body, **{name: reference})
        rows.append(_features(body, terms, k, **{name: reference}))
        names.append(name)
    if not rows:
        return []
    shifted = models.risk(pd.DataFrame(rows, columns=FEATURES))
    drivers = []
    for name, other in zip(names, shifted, strict=True):
        delta = risk - float(other)
        if abs(delta) < MIN_DRIVER_SHIFT:
            continue
        reference = ctx.reference[name]
        drivers.append(
            {
                "feature": name,
                "label": DRIVER_LABELS[name],
                "value": values[name],
                "reference": round(reference, 2) if isinstance(reference, float) else reference,
                "risk_at_reference": round(float(other), 4),
                "delta": round(delta, 4),
                "direction": "raises" if delta > 0 else "lowers",
            }
        )
    drivers.sort(key=lambda d: -abs(d["delta"]))
    return drivers[:TOP_DRIVERS]


def _candidates(engine: Engine, features: pd.DataFrame, outcome: pd.DataFrame) -> dict:
    """Every family's answer to the same scenario, champion flagged, for the side-by-side view."""
    models = engine.models
    champions = models.champions

    def tag(task: str, family: str) -> dict:
        return {
            "family": family,
            "label": FAMILY_LABELS[family],
            "is_champion": champions[task] == family,
        }

    risk = models.risk_by_family(features)
    ttd = models.ttd_by_family(features)
    career = models.career_by_family(outcome)
    salary = models.salary_by_family(outcome)
    return {
        "champions": dict(champions),
        "risk": [{**tag("risk", f), "risk": round(float(v[0]), 4)} for f, v in risk.items()],
        "time_to_degree": [
            {
                **tag("time_to_degree", f),
                "low": round(float(v[0][0]), 2),
                "mid": round(float(v[0][1]), 2),
                "high": round(float(v[0][2]), 2),
            }
            for f, v in ttd.items()
        ],
        "career": [
            {
                **tag("career", f),
                "probabilities": [
                    {"label": label, "probability": round(p, 4)}
                    for label, p in sorted(probs.items(), key=lambda item: -item[1])
                ],
            }
            for f, probs in career.items()
        ],
        "salary": [
            {
                **tag("salary", f),
                "low": round(float(v[0])),
                "mid": round(float(v[1])),
                "high": round(float(v[2])),
            }
            for f, v in salary.items()
        ],
    }


def arena(engine: Engine) -> dict:
    """models/arena.json exactly as frozen at training time."""
    if engine.models.arena_report is None:
        raise NotReady("arena_not_ready", "The model arena report is not available.", ["run: make train"])
    return engine.models.arena_report


def simulate(engine: Engine, requested: ModelLabRequest) -> dict:
    if engine.models.arena_models is None:
        raise NotReady("arena_not_ready", "The model arena is not available.", ["run: make train"])
    ctx = _context(engine)
    key = json.dumps(requested.model_dump(), sort_keys=True)
    with ctx.lock:
        if key in ctx.cache:
            ctx.cache.move_to_end(key)
            return ctx.cache[key]
    result = _simulate(ctx, requested)
    with ctx.lock:
        ctx.cache[key] = result
        while len(ctx.cache) > CACHE_SIZE:
            ctx.cache.popitem(last=False)
    return result


def _simulate(ctx: Context, requested: ModelLabRequest) -> dict:
    engine = ctx.engine
    models, manifest = engine.models, engine.models.manifest
    body, clipped = _clip(ctx, requested)
    done = body.completed_terms
    terms, effective = _history(ctx, body)

    stages = pd.DataFrame([_features(body, terms, k) for k in range(K_MAX + 1)], columns=FEATURES)
    risks, ttds = models.risk(stages), models.ttd(stages)
    trajectory = [
        {
            "term": k,
            "risk": round(float(risks[k]), 4),
            "years_low": round(float(ttds[k][0]), 2),
            "years_mid": round(float(ttds[k][1]), 2),
            "years_high": round(float(ttds[k][2]), 2),
            "projected": k > done,
        }
        for k in range(K_MAX + 1)
    ]
    risk, ttd = float(risks[done]), ttds[done]

    outcome = scenario_outcome_features(
        _features(body, terms, K_MAX), body.internship_count, body.credential_count,
        body.engagement_count,
    )
    candidates = _candidates(engine, stages.iloc[[done]], outcome)
    champions = candidates["champions"]
    career = next(c for c in candidates["career"] if c["family"] == champions["career"])
    salary = next(c for c in candidates["salary"] if c["family"] == champions["salary"])

    autopsy = models.autopsy
    observed = terms[:done]
    pattern = models.pattern(observed, body.enrollment_gaps)
    you = autopsy["pca"].transform(
        autopsy["scaler"].transform([history_features(observed, body.enrollment_gaps)])
    )[0]

    support = {
        "risk": manifest["metrics"][str(min(done, K_MAX))]["n_train"],
        "time_to_degree": manifest["metrics"][str(min(done, K_MAX))]["n_train"],
        "career": manifest["outcome_metrics"]["career"]["n_train"],
        "salary": manifest["outcome_metrics"]["salary"]["n_train"],
    }
    tr = engine.rec(
        "model_lab",
        requested.model_dump(),
        {
            "risk": risk,
            "ttd": ttd.tolist(),
            "career": {p["label"]: p["probability"] for p in career["probabilities"]},
            "salary": [salary["low"], salary["mid"], salary["high"]],
            "candidates": candidates,
        },
    )
    return {
        "scenario": requested.model_dump(),
        "effective": {
            **effective,
            "work_hours": body.work_hours,
            "credential_count": body.credential_count,
            "engagement_count": body.engagement_count,
        },
        "out_of_range": clipped,
        "risk": round(risk, 4),
        "risk_is_probability": models.calibrated_ok,
        "time_to_degree": {
            "low": round(float(ttd[0]), 2),
            "mid": round(float(ttd[1]), 2),
            "high": round(float(ttd[2]), 2),
        },
        "trajectory": trajectory,
        "career": career["probabilities"],
        "salary": {
            "low": salary["low"], "mid": salary["mid"], "high": salary["high"],
            "support": support["salary"],
        },
        "pattern": pattern or "not enough history",
        "constellation": {
            "points": ctx.constellation,
            "you": {"x": round(float(you[0]), 3), "y": round(float(you[1]), 3), "pattern": pattern},
        },
        "drivers": _drivers(ctx, body, risk),
        "drivers_basis": DRIVERS_BASIS,
        "candidates": candidates,
        "models": [
            {
                "task": task,
                "name": TASK_NAMES[task],
                "family": champions[task],
                "kind": KINDS[task][champions[task]],
                "support": support[task],
            }
            for task in TASK_NAMES
        ],
        "tool_result_id": tr,
        "disclaimer": DISCLAIMER,
    }


def _terms_used(engine: Engine, cid: str) -> np.ndarray:
    return engine.people.terms_of(cid)[:K_MAX]


def scenario_from_student(engine: Engine, cid: str) -> ModelLabRequest:
    """Turn a real profile's audit-derived state into the lab's scenario shape (§ from-student)."""
    s = engine.current(cid)
    terms = _terms_used(engine, cid)
    k = len(terms)
    att = terms[:, ATT] if k else np.zeros(0)
    return ModelLabRequest(
        major=s["major"], entry_type=s["entry_type"], residency=s["residency"],
        work_hours=int(min(max(s["work_hours"] or 0, 0), 50)),
        completed_terms=min(k, K_MAX),
        credits_per_term=round(float(att.mean())) if k else 12,
        earned_ratio=round(float(terms[:, EARNED].sum() / terms[:, ATT].sum()), 4) if k and terms[:, ATT].sum() else 1.0,
        withdrawals=int(terms[:, W].sum()) if k else 0,
        failures=int(terms[:, F].sum()) if k else 0,
        enrollment_gaps=int(engine.people.gaps.get(cid, 0) > 0),
    )


def from_student(engine: Engine, body: FromStudentRequest) -> dict:
    """The lab scenario derived from a real audit profile, overrides applied on top (§ contract)."""
    engine.current(body.student_id)  # NotFound if unknown
    base = scenario_from_student(engine, body.student_id)
    scenario = ModelLabRequest(**{**base.model_dump(), **body.overrides})
    baseline_result = simulate(engine, base)
    result = simulate(engine, scenario)
    return {
        **result,
        "derived_from": {
            "student_id": body.student_id,
            "terms_used": base.completed_terms,
            "source": "audit" if body.student_id.startswith("USR-") else "dataset",
        },
        "baseline": {
            "scenario": baseline_result["scenario"],
            "risk": baseline_result["risk"],
            "time_to_degree": baseline_result["time_to_degree"],
            "pattern": baseline_result["pattern"],
            "tool_result_id": baseline_result["tool_result_id"],
        },
    }
