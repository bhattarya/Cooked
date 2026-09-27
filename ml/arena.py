"""The model arena: four competing model families per prediction task, one champion each.

Tasks: academic risk (per stage k = 0..6), time to degree (per stage), career destination and
first-job salary. For each task every family (ml/candidates.py) sees exactly the same rows.

Protocol, fixed before any candidate is scored:

  1. Champion selection uses a validation slice carved from the TRAIN years, never the test
     holdout. Each family is fitted on the years before the validation year and scored on the
     validation year. The champion is the simplest family within 1% (relative) of the best
     validation score (ml/arena_metrics.choose_champion).
  2. Every family is then refitted on all training years (risk and time to degree: <= 2021, with
     Platt calibration on 2022 for risk; career and salary: <= 2022) and scored once on the
     graduating classes of 2023-2026.
  3. Holdout differences are reported with paired bootstrap intervals. A model "beats" another
     only if the 95% interval of its improvement excludes zero.

Everything is seeded (ml.risk_model.SEED) and contains no timestamps, so retraining on the same
data reproduces models/arena.json byte for byte.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

from ml.arena_metrics import (
    SCATTER_MAX,
    TOLERANCE,
    bootstrap_auroc_gain,
    bootstrap_loss_gain,
    calibration_points,
    career_roc,
    career_row_loss,
    career_stats,
    choose_champion,
    permutation_importance,
    pinball_rows,
    quantile_stats,
    risk_stats,
    rnd,
    roc_points,
)
from ml.candidates import (
    FAMILIES,
    FAMILY_LABELS,
    KINDS,
    fit_quantiles,
    hyperparameters,
    make_classifier,
)
from ml.outcomes import (
    CAREER_CLASSES,
    OUTCOME_FEATURES,
    OUTCOME_TEST_MIN_YEAR,
    OUTCOME_TRAIN_MAX_YEAR,
    outcome_frame,
)
from ml.risk_model import (
    CAL_YEAR,
    QUANTILES,
    SEED,
    TRAIN_MAX_YEAR,
    calibrated,
    logit,
    split,
)
from ml.snapshots import FEATURE_LABELS, FEATURES, K_MAX, People, training_frame

SCHEMA_VERSION = 1
HEADLINE_STAGE = {"risk": 0, "time_to_degree": 1}
# task -> (selection metric, higher is better)
SELECTION = {
    "risk": ("Mean validation AUROC over stages 0 to 6", True),
    "time_to_degree": (
        "Mean validation pinball loss (p25, p50, p75) over stages 0 to 6, in years",
        False,
    ),
    "career": ("Validation log loss", False),
    "salary": ("Validation pinball loss (p25, p50, p75), in dollars", False),
}
LINEAR_INDEX = FAMILIES.index("linear")
GENERIC_NOT_FOR = [
    "Deciding whether a real student may enrol, stay enrolled or receive aid.",
    "Labelling or ranking real people. It is a planning aid for exploring scenarios.",
    "Any statement about real UMBC students. The data comes from a simulation.",
]


@dataclass
class ArenaRun:
    report: dict  # the models/arena.json content
    models: dict  # every fitted candidate, for the API's side-by-side view
    champions: dict[str, str]  # task -> family
    shipped: dict  # champion models in the shape ml.model_interface expects
    metrics: dict[int, dict]  # per-stage metrics of the shipped risk and time-to-degree models
    outcome_metrics: dict  # the same for the shipped career and salary models
    training_ids: list[str] = field(default_factory=list)


def _years(values: np.ndarray) -> list[int]:
    return [int(values.min()), int(values.max())]


def _quantile_matrix(models: dict, X) -> np.ndarray:
    return np.sort(np.column_stack([models[q].predict(X) for q in QUANTILES]), axis=1)


def _rounded(values, digits: int = 3) -> list[float]:
    return [rnd(v, digits) for v in values]


def _fit_risk(family: str, X, y, X_cal, y_cal) -> dict:
    clf = make_classifier("risk", family).fit(X, y)
    if family == "baseline":  # a constant prior has nothing to calibrate
        return {"clf": clf, "platt": None}
    platt = LogisticRegression(C=1e6, max_iter=1000).fit(
        logit(clf.predict_proba(X_cal)[:, 1]), y_cal
    )
    return {"clf": clf, "platt": platt}


# ---------------------------------------------------------------------------------------
# Risk and time to degree: one model per stage k, the same alumni feed both tasks
# ---------------------------------------------------------------------------------------
def _run_staged(people: People, stages: list[int], log) -> dict:
    tasks = ("risk", "time_to_degree")
    validation = {t: {f: {} for f in FAMILIES} for t in tasks}
    final = {t: {f: {} for f in FAMILIES} for t in tasks}
    holdout: dict[int, dict] = {}
    splits: list[dict] = []
    used: set[str] = set()
    years: dict[str, list[int]] = {}

    for k in stages:
        ts = training_frame(people, k)
        X, y, t, year = ts.X, ts.cooked.astype(int), ts.ttd, ts.year
        train, cal, test = split(year)
        fit, val = year <= TRAIN_MAX_YEAR - 1, year == TRAIN_MAX_YEAR
        masks = {"fit": fit, "validation": val, "train": train, "calibration": cal, "test": test}
        for name, mask in masks.items():
            years.setdefault(name, _years(year[mask]))
        used |= set(np.array(ts.ids)[train | cal])
        holdout[k] = {"X": X[test].reset_index(drop=True), "y": y[test], "t": t[test]}
        splits.append(
            {
                "stage": k,
                "n_fit": int(fit.sum()),
                "n_validation": int(val.sum()),
                "n_train": int(train.sum()),
                "n_calibration": int(cal.sum()),
                "n_test": int(test.sum()),
                "base_rate_test": rnd(y[test].mean()),
            }
        )

        for family in FAMILIES:
            # selection: fit before the validation year, score on it
            early = make_classifier("risk", family).fit(X[fit], y[fit])
            validation["risk"][family][k] = roc_auc_score(y[val], early.predict_proba(X[val])[:, 1])
            early_q = fit_quantiles("time_to_degree", family, X[fit], t[fit])
            validation["time_to_degree"][family][k] = pinball_rows(
                t[val], _quantile_matrix(early_q, X[val])
            ).mean()

            # final: refit on every training year, score once on the holdout
            model = _fit_risk(family, X[train], y[train], X[cal], y[cal])
            p_raw = model["clf"].predict_proba(X[test])[:, 1]
            p = calibrated(model, X[test])
            final["risk"][family][k] = {
                "model": model,
                "p": p,
                "stats": risk_stats(y[test], p_raw, p),
            }
            qs = fit_quantiles("time_to_degree", family, X[train], t[train])
            pred = _quantile_matrix(qs, X[test])
            final["time_to_degree"][family][k] = {
                "models": qs,
                "pred": pred,
                "stats": quantile_stats(t[test], pred),
            }
        log(f"  arena stage k={k}: {int(train.sum())} train, {int(test.sum())} test alumni")

    return {
        "validation": validation,
        "final": final,
        "holdout": holdout,
        "splits": splits,
        "training_ids": sorted(used),
        "years": years,
    }


# ---------------------------------------------------------------------------------------
# Career destination and first salary: one model each over completed profiles
# ---------------------------------------------------------------------------------------
def _run_outcomes(people: People, log) -> dict:
    o = outcome_frame(people)
    train, test = o.year <= OUTCOME_TRAIN_MAX_YEAR, o.year >= OUTCOME_TEST_MIN_YEAR
    fit, val = o.year <= OUTCOME_TRAIN_MAX_YEAR - 1, o.year == OUTCOME_TRAIN_MAX_YEAR
    labelled = np.array([d is not None for d in o.destination])
    employed = np.isfinite(o.salary) & (o.salary > 0)
    classes = sorted(CAREER_CLASSES)

    masks = {}
    for task, rows in (("career", labelled), ("salary", employed)):
        masks[task] = {
            "fit": fit & rows,
            "validation": val & rows,
            "train": train & rows,
            "test": test & rows,
        }
    out: dict = {
        "o": o,
        "classes": classes,
        "masks": masks,
        "validation": {"career": {}, "salary": {}},
        "final": {"career": {}, "salary": {}},
    }

    for family in FAMILIES:
        m, y = masks["career"], o.destination
        early = make_classifier("career", family).fit(o.X[m["fit"]], y[m["fit"]])
        assert list(early.classes_) == classes
        P = early.predict_proba(o.X[m["validation"]])
        out["validation"]["career"][family] = float(
            career_row_loss(y[m["validation"]], P, classes).mean()
        )
        clf = make_classifier("career", family).fit(o.X[m["train"]], y[m["train"]])
        P = clf.predict_proba(o.X[m["test"]])
        out["final"]["career"][family] = {
            "model": clf,
            "P": P,
            "stats": career_stats(y[m["test"]], P, classes),
            "roc": career_roc(y[m["test"]], P, classes),
        }

        m, y = masks["salary"], o.salary
        early_q = fit_quantiles("salary", family, o.X[m["fit"]], y[m["fit"]])
        pred = _quantile_matrix(early_q, o.X[m["validation"]])
        out["validation"]["salary"][family] = float(pinball_rows(y[m["validation"]], pred).mean())
        qs = fit_quantiles("salary", family, o.X[m["train"]], y[m["train"]])
        pred = _quantile_matrix(qs, o.X[m["test"]])
        out["final"]["salary"][family] = {
            "models": qs,
            "pred": pred,
            "stats": quantile_stats(y[m["test"]], pred),
        }
    log(
        f"  arena career: {int(masks['career']['train'].sum())} train, "
        f"{int(masks['career']['test'].sum())} test; salary: "
        f"{int(masks['salary']['train'].sum())} train, {int(masks['salary']['test'].sum())} test"
    )
    return out


# ---------------------------------------------------------------------------------------
# Selection, comparison and the report
# ---------------------------------------------------------------------------------------
def _selection(task: str, scores: dict[str, float], extra: dict) -> dict:
    metric, higher = SELECTION[task]
    champion, eligible = choose_champion(scores, higher)
    return {
        "pre_registered": True,
        "metric": metric,
        "higher_is_better": higher,
        "tolerance_relative": TOLERANCE,
        "complexity_order": list(FAMILIES),
        "rule": (
            "Each family is fitted on the years before the validation year and scored on the "
            "validation year, a slice of the training years. The champion is the simplest family "
            "within the tolerance of the best validation score. The test holdout is never used."
        ),
        "scores": {f: rnd(scores[f]) for f in FAMILIES},
        "eligible": eligible,
        "champion": champion,
        "test_used_for_selection": False,
        **extra,
    }


def _champion_block(
    task: str, candidates: list[dict], champion: str, primary: str, higher: bool, gain_name: str
) -> dict:
    """Says plainly whether the shipped model earned its place on the holdout."""
    by = {c["family"]: c for c in candidates}
    chosen = by[champion]
    baseline_ok = bool(chosen["beats_baseline"])  # False when the champion IS the baseline
    linear_ok = chosen["beats_linear"] if champion in ("forest", "boosting") else None
    learned = [c for c in candidates if c["family"] != "baseline"]
    best = (max if higher else min)(candidates, key=lambda c: c["metrics"][primary])
    notes = []
    if champion == "baseline":
        notes.append(
            "No learned model beat the naive baseline on the validation years, so the naive "
            "baseline is the champion and ships."
        )
        winners = [c["label"].lower() for c in learned if c["beats_baseline"]]
        if winners:
            notes.append(
                f"On the test holdout {' and '.join(winners)} did beat it beyond noise, which "
                "the validation years did not show."
            )
        else:
            notes.append(
                "The test holdout agrees: no learned model beats it beyond noise, so with these "
                "inputs the models add no reliable signal."
            )
    elif baseline_ok:
        notes.append(
            "The champion beats the naive baseline on the test holdout (95% interval excludes zero)."
        )
    else:
        notes.append(
            "The champion does not beat the naive baseline on the test holdout beyond noise: "
            f"the 95% interval of its {gain_name} includes zero or is negative."
        )
    if champion in ("forest", "boosting"):
        if linear_ok:
            notes.append(
                "It also beats the linear model beyond noise, so the extra complexity earned its place."
            )
        else:
            notes.append(
                "It is not distinguishable from the linear model beyond noise on the holdout, "
                "so the extra complexity is not demonstrably worth it."
            )
    elif champion == "linear":
        notes.append(
            "A simple linear model was good enough: no more complex family beat it by the "
            "validation tolerance."
        )
    if best["family"] != champion and champion != "baseline":
        notes.append(
            f"On the test holdout {FAMILY_LABELS[best['family']].lower()} scored numerically "
            "better than the champion; the champion was fixed on the validation years, so it stays."
        )
    return {
        "family": champion,
        "label": FAMILY_LABELS[champion],
        "task": task,
        "beats_baseline": baseline_ok,
        "beats_linear": linear_ok,
        "holdout_best_family": best["family"],
        "note": " ".join(notes),
    }


def _importance_family(champion: str, scores: dict[str, float], higher: bool) -> str:
    """The champion, or the best-scoring learned family when the champion is the baseline
    (a constant predictor uses no features, so it has no importances to show)."""
    if champion != "baseline":
        return champion
    learned = {f: v for f, v in scores.items() if f != "baseline"}
    return (max if higher else min)(learned, key=learned.get)


def _importance_note(family: str, champion: str) -> str:
    if family == champion:
        return "Importances are for the champion."
    return (
        "The champion is the naive baseline, which uses no inputs. These importances are for "
        f"the best learned family on validation ({FAMILY_LABELS[family].lower()}), shown only to "
        "say which inputs carry any signal."
    )


def _link_gains(candidates: list[dict], gain_of) -> None:
    """Attach `vs_baseline` / `vs_linear` (paired bootstrap on the holdout) to each candidate."""
    for i, c in enumerate(candidates):
        c["vs_baseline"] = None if c["family"] == "baseline" else gain_of(c["family"], "baseline")
        c["beats_baseline"] = bool(c["vs_baseline"]["beats"]) if c["vs_baseline"] else False
        if i > LINEAR_INDEX:
            c["vs_linear"] = gain_of(c["family"], "linear")
            c["beats_linear"] = bool(c["vs_linear"]["beats"])
        else:
            c["vs_linear"], c["beats_linear"] = None, None


def _candidate_shell(task: str, family: str, champion: str, validation: dict) -> dict:
    return {
        "family": family,
        "label": FAMILY_LABELS[family],
        "kind": KINDS[task][family],
        "complexity": FAMILIES.index(family),
        "hyperparameters": hyperparameters(task, family),
        "is_champion": family == champion,
        "validation": validation,
    }


def _scatter(actual, families: dict[str, np.ndarray], digits: int, stage: int | None) -> dict:
    """At most SCATTER_MAX holdout rows, the same rows for every family."""
    n = len(actual)
    pick = np.sort(np.random.default_rng(SEED).choice(n, size=min(n, SCATTER_MAX), replace=False))
    scatter = {
        "n_total": n,
        "n_shown": len(pick),
        "actual": _rounded(actual[pick], digits),
        "families": {
            f: {
                name: _rounded(pred[pick, i], digits)
                for i, name in enumerate(("low", "mid", "high"))
            }
            for f, pred in families.items()
        },
    }
    return {"stage": stage, **scatter} if stage is not None else scatter


def _stage_task(task: str, run: dict, stages: list[int]) -> tuple[dict, str, dict]:
    """Report block for `risk` or `time_to_degree`."""
    risk = task == "risk"
    scores = {f: float(np.mean(list(run["validation"][task][f].values()))) for f in FAMILIES}
    _, higher = SELECTION[task]
    champion, _ = choose_champion(scores, higher)
    head = HEADLINE_STAGE[task] if HEADLINE_STAGE[task] in stages else stages[0]
    hold = run["holdout"][head]
    final = run["final"][task]
    per_stage_key = "auroc" if risk else "pinball"
    seed = SEED + (11 if risk else 12)

    candidates = []
    for family in FAMILIES:
        stats = {k: final[family][k]["stats"] for k in stages}
        if risk:
            keep = ("auroc", "auprc", "brier", "log_loss", "calibration_slope", "base_rate")
            metrics = {m: None if stats[head][m] is None else rnd(stats[head][m]) for m in keep}
            metrics["n_test"] = len(hold["y"])
            per_stage = [
                {
                    "stage": k,
                    "n_test": len(run["holdout"][k]["y"]),
                    **{m: rnd(stats[k][m]) for m in ("auroc", "auprc", "brier", "log_loss")},
                }
                for k in stages
            ]
            curves = {
                "roc": {
                    str(k): roc_points(run["holdout"][k]["y"], final[family][k]["p"])
                    for k in stages
                },
                "calibration": {
                    str(k): calibration_points(run["holdout"][k]["y"], final[family][k]["p"])
                    for k in stages
                },
            }
        else:
            keep = ("mae", "pinball", "interval_coverage", "r2", "bias")
            metrics = {m: rnd(stats[head][m]) for m in keep}
            metrics["mae_baseline"] = rnd(final["baseline"][head]["stats"]["mae"])
            metrics["n_test"] = len(hold["t"])
            per_stage = [
                {
                    "stage": k,
                    "n_test": len(run["holdout"][k]["t"]),
                    **{m: rnd(stats[k][m]) for m in ("mae", "pinball", "interval_coverage")},
                }
                for k in stages
            ]
            curves = None
        validation = {
            "score": rnd(scores[family]),
            "per_stage": [
                {"stage": k, per_stage_key: rnd(run["validation"][task][family][k])}
                for k in stages
            ],
        }
        shell = _candidate_shell(task, family, champion, validation)
        shell.update(metrics=metrics, per_stage=per_stage)
        if curves:
            shell["curves"] = curves
        candidates.append(shell)

    if risk:

        def gain_of(new, ref):
            return bootstrap_auroc_gain(hold["y"], final[new][head]["p"], final[ref][head]["p"], seed)

    else:
        rows = {f: pinball_rows(hold["t"], final[f][head]["pred"]) for f in FAMILIES}

        def gain_of(new, ref):
            return bootstrap_loss_gain(rows[new], rows[ref], seed)

    _link_gains(candidates, gain_of)
    block = _champion_block(
        task,
        candidates,
        champion,
        "auroc" if risk else "pinball",
        risk,
        "AUROC improvement" if risk else "pinball-loss improvement",
    )

    # permutation importance on the holdout rows of every stage
    family = _importance_family(champion, scores, higher)
    importance = {}
    for k in stages:
        h, model = run["holdout"][k], final[family][k]
        if risk:

            def score(X, h=h, model=model):
                return roc_auc_score(h["y"], calibrated(model["model"], X))

        else:

            def score(X, h=h, model=model):
                return -float(np.mean(np.abs(h["t"] - _quantile_matrix(model["models"], X)[:, 1])))

        importance[str(k)] = permutation_importance(score, h["X"], seed + k)

    out = {
        "champion": block,
        "candidates": candidates,
        "importance": {
            "family": family,
            "note": _importance_note(family, champion),
            "metric": (
                "Drop in holdout AUROC when the column is shuffled"
                if risk
                else "Increase in holdout median error (years) when the column is shuffled"
            ),
            "by_stage": importance,
        },
    }
    if not risk:
        out["scatter"] = _scatter(
            hold["t"], {f: final[f][head]["pred"] for f in FAMILIES}, 3, head
        )
    return out, champion, scores


def _outcome_task(task: str, run: dict) -> tuple[dict, str, dict]:
    """Report block for `career` or `salary`."""
    career = task == "career"
    o, masks = run["o"], run["masks"][task]
    scores = {f: float(run["validation"][task][f]) for f in FAMILIES}
    _, higher = SELECTION[task]
    champion, _ = choose_champion(scores, higher)
    final = run["final"][task]
    test = masks["test"]
    y = o.destination[test] if career else o.salary[test]
    seed = SEED + (13 if career else 14)

    candidates = []
    for family in FAMILIES:
        stats = final[family]["stats"]
        keep = (
            ("macro_f1", "accuracy", "top2_accuracy", "log_loss")
            if career
            else ("mae", "pinball", "interval_coverage", "r2", "bias")
        )
        metrics = {m: rnd(stats[m]) for m in keep}
        if not career:
            metrics["mae_baseline"] = rnd(final["baseline"]["stats"]["mae"])
        metrics["n_test"] = int(test.sum())
        shell = _candidate_shell(task, family, champion, {"score": rnd(scores[family])})
        shell["metrics"] = metrics
        if career:
            shell["per_class"] = stats["per_class"]
            shell["confusion"] = stats["confusion"]
            shell["roc"] = final[family]["roc"]
        candidates.append(shell)

    if career:
        rows = {f: career_row_loss(y, final[f]["P"], run["classes"]) for f in FAMILIES}
    else:
        rows = {f: pinball_rows(y, final[f]["pred"]) for f in FAMILIES}

    def gain_of(new, ref):
        return bootstrap_loss_gain(rows[new], rows[ref], seed)

    _link_gains(candidates, gain_of)
    block = _champion_block(
        task,
        candidates,
        champion,
        "log_loss" if career else "pinball",
        False,
        "log-loss improvement" if career else "pinball-loss improvement",
    )

    family = _importance_family(champion, scores, higher)
    model = final[family]
    if career:

        def score(X):
            return -float(career_row_loss(y, model["model"].predict_proba(X), run["classes"]).mean())

        metric_text = "Increase in holdout log loss when the column is shuffled"
    else:

        def score(X):
            return -float(np.mean(np.abs(y - _quantile_matrix(model["models"], X)[:, 1])))

        metric_text = "Increase in holdout median error (dollars) when the column is shuffled"
    out = {
        "champion": block,
        "candidates": candidates,
        "importance": {
            "family": family,
            "note": _importance_note(family, champion),
            "metric": metric_text,
            "features": permutation_importance(score, o.X[test].reset_index(drop=True), seed),
        },
    }
    if not career:
        out["scatter"] = _scatter(y, {f: final[f]["pred"] for f in FAMILIES}, 0, None)
    return out, champion, scores


def _protocol(test_years: list[int]) -> dict:
    return {
        "temporal": True,
        "same_rows_for_every_family": True,
        "features_fixed_before_scoring": True,
        "test_years": test_years,
        "steps": [
            "Every family is trained and scored on exactly the same rows.",
            (
                f"Champion choice: each family is fitted on the years before {TRAIN_MAX_YEAR} "
                f"(risk, time to degree) or {OUTCOME_TRAIN_MAX_YEAR} (career, salary) and "
                "scored on that year. The simplest family within one percent of the best score "
                "wins."
            ),
            (
                "Refit on all training years, calibrate (risk only, Platt scaling on "
                f"{CAL_YEAR}), then score once on the graduating classes of {test_years[0]} to "
                f"{test_years[1]}."
            ),
            (
                "A model beats another only if the 95% bootstrap interval of its holdout "
                "improvement excludes zero."
            ),
        ],
    }


def run_arena(people: People, stages: list[int] | None = None, log=print) -> ArenaRun:
    stages = list(range(K_MAX + 1)) if stages is None else list(stages)
    staged = _run_staged(people, stages, log)
    outcomes = _run_outcomes(people, log)
    years = staged["years"]

    tasks: dict[str, dict] = {}
    champions: dict[str, str] = {}
    for task in ("risk", "time_to_degree"):
        block, champion, scores = _stage_task(task, staged, stages)
        block["selection"] = _selection(
            task,
            scores,
            {
                "fit_years": years["fit"],
                "validation_years": years["validation"],
                "n_validation_per_stage": [s["n_validation"] for s in staged["splits"]],
            },
        )
        block["split"] = {
            "stages": stages,
            "fit_years": years["fit"],
            "validation_years": years["validation"],
            "train_years": years["train"],
            "calibration_years": years["calibration"] if task == "risk" else None,
            "test_years": years["test"],
            "per_stage": staged["splits"],
        }
        tasks[task], champions[task] = block, champion
    for task in ("career", "salary"):
        block, champion, scores = _outcome_task(task, outcomes)
        o, masks = outcomes["o"], outcomes["masks"][task]
        span = {name: _years(o.year[mask]) for name, mask in masks.items()}
        block["selection"] = _selection(
            task,
            scores,
            {
                "fit_years": span["fit"],
                "validation_years": span["validation"],
                "n_validation": int(masks["validation"].sum()),
            },
        )
        block["split"] = {
            "fit_years": span["fit"],
            "validation_years": span["validation"],
            "train_years": span["train"],
            "calibration_years": None,
            "test_years": span["test"],
            "n_fit": int(masks["fit"].sum()),
            "n_validation": int(masks["validation"].sum()),
            "n_train": int(masks["train"].sum()),
            "n_test": int(masks["test"].sum()),
        }
        tasks[task], champions[task] = block, champion

    _describe(tasks, staged, outcomes, stages)
    report = {
        "schema_version": SCHEMA_VERSION,
        "dataset": {
            "name": "HackUMBC 2026 Career Pathways & Degree ROI",
            "synthetic": True,
            "alumni": len(people.alumni_ids),
            "current_students_in_training": 0,
            "disclaimer": (
                "Synthetic data from a simulation for HackUMBC 2026. Nothing here describes real "
                "UMBC students, and every result is an association, not a causal promise."
            ),
        },
        "seed": SEED,
        "protocol": _protocol(years["test"]),
        "families": [
            {"id": f, "label": FAMILY_LABELS[f], "complexity": i} for i, f in enumerate(FAMILIES)
        ],
        "tasks": tasks,
    }
    return _bundle(report, staged, outcomes, champions, stages)


def _bundle(report, staged, outcomes, champions, stages) -> ArenaRun:
    final, cf = staged["final"], outcomes["final"]
    models = {
        "risk": {f: {k: final["risk"][f][k]["model"] for k in stages} for f in FAMILIES},
        "ttd": {f: {k: final["time_to_degree"][f][k]["models"] for k in stages} for f in FAMILIES},
        "career": {
            f: {"model": cf["career"][f]["model"], "classes": outcomes["classes"]}
            for f in FAMILIES
        },
        "salary": {f: {"models": cf["salary"][f]["models"]} for f in FAMILIES},
    }
    shipped = {
        "risk": models["risk"][champions["risk"]],
        "ttd": models["ttd"][champions["time_to_degree"]],
        "career": models["career"][champions["career"]],
        "salary": models["salary"][champions["salary"]],
    }

    metrics = {}
    for k, row in zip(stages, staged["splits"], strict=True):
        r = final["risk"][champions["risk"]][k]["stats"]
        t = final["time_to_degree"][champions["time_to_degree"]][k]["stats"]
        metrics[k] = {
            "n_train": row["n_train"],
            "n_cal": row["n_calibration"],
            "n_test": row["n_test"],
            "base_rate_test": r["base_rate"],
            "auc": r["auroc_raw"],
            "auc_calibrated": r["auroc"],
            "brier": r["brier"],
            "brier_baseline": final["risk"]["baseline"][k]["stats"]["brier"],
            "calibration_slope": r["calibration_slope"],
            "top_decile_precision": r["top_decile_precision"],
            "ttd_mae": t["mae"],
            "ttd_mae_baseline": final["time_to_degree"]["baseline"][k]["stats"]["mae"],
            "ttd_r2": t["r2"],
            "ttd_interval_coverage": t["interval_coverage"],
            "train_years": staged["years"]["train"],
            "test_years": staged["years"]["test"],
        }

    o, masks = outcomes["o"], outcomes["masks"]
    c = cf["career"][champions["career"]]["stats"]
    s = cf["salary"][champions["salary"]]["stats"]
    raw = o.raw_destination
    outcome_metrics = {
        "career": {
            "n_train": int(masks["career"]["train"].sum()),
            "n_test": int(masks["career"]["test"].sum()),
            "classes": outcomes["classes"],
            "support": {cl: int((o.destination == cl).sum()) for cl in CAREER_CLASSES},
            "accuracy": c["accuracy"],
            "macro_f1": c["macro_f1"],
            "log_loss": c["log_loss"],
            "top2_accuracy": c["top2_accuracy"],
            "test_years": _years(o.year[masks["career"]["test"]]),
            "no_response_excluded": int((raw == "No Response").sum()),
            "military_excluded": int((raw == "Military").sum()),
        },
        "salary": {
            "n_train": int(masks["salary"]["train"].sum()),
            "n_test": int(masks["salary"]["test"].sum()),
            "mae": s["mae"],
            "mae_baseline": cf["salary"]["baseline"]["stats"]["mae"],
            "r2": s["r2"],
            "interval_coverage": s["interval_coverage"],
            "bias": s["bias"],
            "test_years": _years(o.year[masks["salary"]["test"]]),
        },
    }
    return ArenaRun(
        report, models, champions, shipped, metrics, outcome_metrics, staged["training_ids"]
    )


# ---------------------------------------------------------------------------------------
# Plain-English model cards, built from the computed results
# ---------------------------------------------------------------------------------------
def _card(*, name, predicts, summary, features, limitations, trained_on, extra_not_for=()):
    return {
        "name": name,
        "predicts": predicts,
        "summary": summary,
        "trained_on": trained_on,
        "features": [{"name": f, "label": FEATURE_LABELS[f]} for f in features],
        "limitations": limitations,
        "should_not_be_used_for": [*GENERIC_NOT_FOR, *extra_not_for],
    }


def _describe(tasks: dict, staged: dict, outcomes: dict, stages: list[int]) -> None:
    years = staged["years"]
    first = staged["splits"][0]
    last_stage = max(stages)
    tasks["risk"]["card"] = _card(
        name="Academic risk",
        predicts=(
            "The probability that a student ends up cooked: taking more than five years to "
            "graduate, or withdrawing from five or more courses in total. It is asked after "
            f"0 to {last_stage} completed regular terms."
        ),
        summary=(
            f"Fitted on {first['n_train']} synthetic alumni who graduated {years['train'][0]} to "
            f"{years['train'][1]}, calibrated on the {years['calibration'][0]} class "
            f"({first['n_calibration']} alumni) and tested once on {first['n_test']} alumni who "
            f"graduated {years['test'][0]} to {years['test'][1]}. Those counts are for the "
            "enrollment-only stage; later stages use the alumni still enrolled at that stage."
        ),
        trained_on={
            "rows_train": first["n_train"],
            "rows_calibration": first["n_calibration"],
            "rows_test": first["n_test"],
            "train_years": years["train"],
            "calibration_years": years["calibration"],
            "test_years": years["test"],
        },
        features=FEATURES,
        limitations=[
            "The data is synthetic, so the patterns describe the simulation, not real UMBC students.",
            (
                "The cooked label counts withdrawals, so once withdrawals are visible (after the "
                "first term) the model is partly reading the answer. The enrollment-only stage is "
                "the honest headline; later stages look better than the model really is."
            ),
            "Associations only: the model does not show that changing a habit changes the outcome.",
            (
                "Each stage only sees alumni who were still enrolled at that stage, so students "
                "who graduated early are never seen there."
            ),
            (
                f"About {first['base_rate_test']:.0%} of the test alumni were cooked, so a model "
                "that never warns anyone is right most of the time. Compare against the baseline."
            ),
        ],
    )
    tasks["time_to_degree"]["card"] = _card(
        name="Time to degree",
        predicts=(
            "A likely range for years from entry to degree: the 25th, 50th and 75th percentiles "
            f"of similar alumni, after 0 to {last_stage} completed regular terms. About half of "
            "alumni should land inside the range."
        ),
        summary=(
            f"Fitted on the same {first['n_train']} alumni as the risk model "
            f"({years['train'][0]} to {years['train'][1]}) and tested on the "
            f"{years['test'][0]} to {years['test'][1]} classes."
        ),
        trained_on={
            "rows_train": first["n_train"],
            "rows_test": first["n_test"],
            "train_years": years["train"],
            "test_years": years["test"],
        },
        features=FEATURES,
        limitations=[
            "The data is synthetic, so the ranges describe the simulation, not real UMBC students.",
            (
                "Ranges are conditional quantiles from alumni who graduated; students who left "
                "without a degree are not in the data."
            ),
            "Associations only, not causal effects of taking more or fewer credits.",
            (
                "The range is meant to hold about half of outcomes, not to guarantee any one "
                "student's date."
            ),
        ],
    )

    o = outcomes["o"]
    cm, sm = outcomes["masks"]["career"], outcomes["masks"]["salary"]
    raw = o.raw_destination
    counts = {c: int((o.destination == c).sum()) for c in CAREER_CLASSES}
    top_class = max(counts, key=counts.get)
    n_none, n_mil = int((raw == "No Response").sum()), int((raw == "Military").sum())
    c_train, c_test = _years(o.year[cm["train"]]), _years(o.year[cm["test"]])
    tasks["career"]["card"] = _card(
        name="Career destination",
        predicts=(
            "Where alumni with a similar degree record went first: Employed, Continuing "
            "education or Still seeking. The output is three probabilities, not a verdict."
        ),
        summary=(
            f"Fitted on {int(cm['train'].sum())} synthetic alumni who graduated {c_train[0]} to "
            f"{c_train[1]} and tested on {int(cm['test'].sum())} who graduated {c_test[0]} to "
            f"{c_test[1]}."
        ),
        trained_on={
            "rows_train": int(cm["train"].sum()),
            "rows_test": int(cm["test"].sum()),
            "train_years": c_train,
            "test_years": c_test,
            "class_counts": counts,
            "no_response_excluded": n_none,
            "military_excluded": n_mil,
        },
        features=OUTCOME_FEATURES,
        limitations=[
            "The data is synthetic, so the patterns describe the simulation, not real UMBC students.",
            (
                f"No Response ({n_none} alumni) means unknown, not unemployed. It is excluded and "
                f"never treated as an outcome. Military ({n_mil} alumni) is too small to be a "
                "class and is also excluded."
            ),
            (
                f"{top_class} is {counts[top_class] / sum(counts.values()):.0%} of labelled "
                "alumni, so the models rarely pick the smaller classes as their top guess. Read "
                "the probabilities, not the label."
            ),
            "Alumni who answered the survey may differ from those who did not.",
            (
                "The internship, credential and engagement counts are what alumni recorded by "
                "graduation. Moving them in the lab shows how outcomes differ across similar "
                "alumni, not what an intervention would do."
            ),
        ],
        extra_not_for=["Promising anyone a job, admission or salary."],
    )

    s_train, s_test = _years(o.year[sm["train"]]), _years(o.year[sm["test"]])
    median = {
        int(yr): float(np.median(o.salary[sm["train"] & (o.year == yr)]))
        for yr in np.unique(o.year[sm["train"]])
    }
    champion = tasks["salary"]["champion"]["family"]
    metrics = next(c for c in tasks["salary"]["candidates"] if c["family"] == champion)["metrics"]
    limits = [
        "The data is synthetic, so the ranges describe the simulation, not real UMBC salaries.",
        (
            f"Only employed alumni have a first salary ({int(sm['train'].sum() + sm['test'].sum())} "
            "alumni), so the answer is what a first salary looked like if employed."
        ),
        (
            "Salaries are nominal dollars of each graduating year and rose over time (median "
            f"${median[s_train[0]]:,.0f} for the {s_train[0]} class, ${median[s_train[1]]:,.0f} "
            f"for {s_train[1]}). Graduation year is not a feature, so the model blends years and "
            "no cross-year dollar comparison is meant."
        ),
        (
            f"On the holdout the champion's median is too {'high' if metrics['bias'] > 0 else 'low'} "
            f"by ${abs(metrics['bias']):,.0f} on average; those classes graduated after every "
            "training class."
        ),
    ]
    if metrics["r2"] < 0:
        limits.append(
            "R-squared is below zero on the holdout: predicting one average salary for "
            "everyone explains the holdout better than the model does in squared-error terms."
        )
    tasks["salary"]["card"] = _card(
        name="First-job salary",
        predicts=(
            "A likely range for first-job annual salary in nominal dollars: the 25th, 50th and "
            "75th percentiles of similar employed alumni."
        ),
        summary=(
            f"Fitted on {int(sm['train'].sum())} employed synthetic alumni who graduated "
            f"{s_train[0]} to {s_train[1]} and tested on {int(sm['test'].sum())} who graduated "
            f"{s_test[0]} to {s_test[1]}."
        ),
        trained_on={
            "rows_train": int(sm["train"].sum()),
            "rows_test": int(sm["test"].sum()),
            "train_years": s_train,
            "test_years": s_test,
            "median_salary_by_year": {str(k): v for k, v in median.items()},
        },
        features=OUTCOME_FEATURES,
        limitations=limits,
        extra_not_for=["Negotiating pay or advising anyone what they should be paid."],
    )
