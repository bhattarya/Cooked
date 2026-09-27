"""Metrics, curves, bootstrap intervals, permutation importance and the champion rule.

Pure functions over arrays, so every number in models/arena.json can be recomputed from the
predictions alone. Nothing here reads the database or fits a model.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    log_loss,
    mean_absolute_error,
    precision_recall_fscore_support,
    r2_score,
    roc_auc_score,
    roc_curve,
    top_k_accuracy_score,
)

from ml.candidates import FAMILIES
from ml.risk_model import QUANTILES, calibration_slope, top_decile_precision
from ml.snapshots import FEATURE_LABELS

TOLERANCE = 0.01  # champion rule: the simplest family within 1% (relative) of the best validation score
CURVE_POINTS = 48
CALIBRATION_BINS = 8
SCATTER_MAX = 300
BOOTSTRAPS = 300
PERMUTATION_REPEATS = 10
TOP_FEATURES = 8


def rnd(x, digits: int = 5) -> float:
    return round(float(x), digits)


# ---------- the champion rule (looks at validation scores only) ----------
def choose_champion(
    scores: dict[str, float], higher_is_better: bool, tolerance: float = TOLERANCE
) -> tuple[str, list[str]]:
    """The simplest family whose validation score is within `tolerance` (relative) of the best.

    `FAMILIES` runs from simplest to most complex, so the first eligible family wins. The
    function is given validation scores and nothing else: it cannot see the test holdout.
    """
    best = max(scores.values()) if higher_is_better else min(scores.values())
    slack = tolerance * abs(best)
    gap = (lambda s: best - s) if higher_is_better else (lambda s: s - best)
    eligible = [f for f in FAMILIES if f in scores and gap(scores[f]) <= slack]
    return eligible[0], eligible


# ---------- binary risk ----------
def risk_stats(y: np.ndarray, p_raw: np.ndarray, p: np.ndarray) -> dict:
    return {
        "auroc_raw": roc_auc_score(y, p_raw),
        "auroc": roc_auc_score(y, p),
        "auprc": average_precision_score(y, p),
        "brier": brier_score_loss(y, p),
        "log_loss": log_loss(y, np.clip(p, 1e-6, 1 - 1e-6), labels=[0, 1]),
        # a constant predictor (the baseline) has no spread to measure
        "calibration_slope": calibration_slope(y, p) if len(np.unique(p)) > 1 else None,
        "top_decile_precision": top_decile_precision(y, p),
        "base_rate": float(np.mean(y)),
    }


def _downsample(n: int, points: int) -> np.ndarray:
    return np.unique(np.linspace(0, n - 1, points).round().astype(int)) if n > points else np.arange(n)


def roc_points(y: np.ndarray, score: np.ndarray) -> dict:
    fpr, tpr, _ = roc_curve(y, score)
    keep = _downsample(len(fpr), CURVE_POINTS)
    return {
        "fpr": [rnd(v, 4) for v in fpr[keep]],
        "tpr": [rnd(v, 4) for v in tpr[keep]],
        "auc": rnd(roc_auc_score(y, score)),
    }


def calibration_points(y: np.ndarray, p: np.ndarray) -> dict:
    """Equal-count bins of predicted risk against the observed rate. A constant predictor
    (the baseline) has one distinct value, so it gets one point."""
    values = np.unique(p)
    if len(values) <= CALIBRATION_BINS:
        groups = [np.where(p == v)[0] for v in values]
    else:
        groups = np.array_split(np.argsort(p, kind="stable"), CALIBRATION_BINS)
    return {
        "predicted": [rnd(p[g].mean(), 4) for g in groups],
        "observed": [rnd(y[g].mean(), 4) for g in groups],
        "n": [len(g) for g in groups],
    }


# ---------- quantile tasks (time to degree, salary) ----------
def pinball_rows(y: np.ndarray, pred: np.ndarray) -> np.ndarray:
    """Per-row pinball loss averaged over the three quantiles; pred is (n, 3), sorted."""
    err = y[:, None] - pred
    q = np.array(QUANTILES)[None, :]
    return np.maximum(q * err, (q - 1) * err).mean(axis=1)


def quantile_stats(y: np.ndarray, pred: np.ndarray) -> dict:
    mid = pred[:, 1]
    return {
        "mae": mean_absolute_error(y, mid),
        "pinball": pinball_rows(y, pred).mean(),
        "interval_coverage": float(((y >= pred[:, 0]) & (y <= pred[:, 2])).mean()),
        "r2": r2_score(y, mid),
        "bias": float(np.mean(mid - y)),
    }


# ---------- career (multiclass) ----------
def career_stats(y: np.ndarray, P: np.ndarray, classes: list[str]) -> dict:
    pred = np.array(classes, dtype=object)[np.argmax(P, axis=1)]
    precision, recall, f1, support = precision_recall_fscore_support(
        y, pred, labels=classes, zero_division=0
    )
    counts = confusion_matrix(y, pred, labels=classes)
    rows = counts.sum(axis=1, keepdims=True)
    return {
        "macro_f1": f1_score(y, pred, labels=classes, average="macro", zero_division=0),
        "accuracy": accuracy_score(y, pred),
        "top2_accuracy": top_k_accuracy_score(y, P, k=2, labels=classes),
        "log_loss": log_loss(y, P, labels=classes),
        "per_class": {
            c: {
                "precision": rnd(precision[i]),
                "recall": rnd(recall[i]),
                "f1": rnd(f1[i]),
                "support": int(support[i]),
            }
            for i, c in enumerate(classes)
        },
        "confusion": {
            "labels": list(classes),
            "row_normalised": (counts / np.maximum(rows, 1)).round(4).tolist(),
            "counts": counts.tolist(),
        },
    }


def career_roc(y: np.ndarray, P: np.ndarray, classes: list[str]) -> dict:
    return {c: roc_points((y == c).astype(int), P[:, i]) for i, c in enumerate(classes)}


def career_row_loss(y: np.ndarray, P: np.ndarray, classes: list[str]) -> np.ndarray:
    index = np.array([classes.index(v) for v in y])
    return -np.log(np.clip(P[np.arange(len(y)), index], 1e-12, 1.0))


# ---------- paired bootstrap ----------
def _interval(samples: list[float]) -> tuple[float, float]:
    return float(np.percentile(samples, 2.5)), float(np.percentile(samples, 97.5))


def bootstrap_auroc_gain(y, p_new, p_ref, seed: int) -> dict:
    """AUROC(new) - AUROC(reference) with a paired 95% bootstrap interval over holdout rows."""
    rng = np.random.default_rng(seed)
    gains = []
    for _ in range(BOOTSTRAPS):
        i = rng.integers(0, len(y), len(y))
        if len(np.unique(y[i])) < 2:
            continue
        gains.append(roc_auc_score(y[i], p_new[i]) - roc_auc_score(y[i], p_ref[i]))
    return _gain(roc_auc_score(y, p_new) - roc_auc_score(y, p_ref), gains)


def bootstrap_loss_gain(loss_new: np.ndarray, loss_ref: np.ndarray, seed: int) -> dict:
    """Mean per-row loss saved versus the reference (positive = better) with a paired interval."""
    rng = np.random.default_rng(seed)
    saved = loss_ref - loss_new
    gains = [saved[rng.integers(0, len(saved), len(saved))].mean() for _ in range(BOOTSTRAPS)]
    return _gain(float(saved.mean()), gains)


def _gain(delta: float, samples: list[float]) -> dict:
    lo, hi = _interval(samples)
    return {"delta": rnd(delta), "ci95": [rnd(lo), rnd(hi)], "beats": bool(lo > 0)}


# ---------- permutation importance ----------
def permutation_importance(
    score: Callable[[pd.DataFrame], float], X: pd.DataFrame, seed: int
) -> list[dict]:
    """Drop in a higher-is-better score when one column is shuffled, on the holdout rows.

    Columns that never vary in the holdout (for example behaviour features at enrollment)
    carry no information and are left out.
    """
    rng = np.random.default_rng(seed)
    base = score(X)
    rows = []
    for column in X.columns:
        if X[column].nunique() < 2:
            continue
        drops = []
        for _ in range(PERMUTATION_REPEATS):
            shuffled = X.copy()
            shuffled[column] = rng.permutation(shuffled[column].to_numpy())
            drops.append(base - score(shuffled))
        rows.append((column, float(np.mean(drops)), float(np.std(drops))))
    rows.sort(key=lambda r: -r[1])
    return [
        {"feature": c, "label": FEATURE_LABELS.get(c, c), "importance": rnd(m), "std": rnd(s)}
        for c, m, s in rows[:TOP_FEATURES]
    ]


# ---------- JSON output that can never hold NaN or infinity ----------
def clean(value):
    """Python-native, finite, rounded copy of a nested structure. Raises on NaN or infinity."""
    if isinstance(value, dict):
        return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [clean(v) for v in value]
    if isinstance(value, np.ndarray):
        return clean(value.tolist())
    if isinstance(value, np.bool_ | bool):
        return bool(value)
    if isinstance(value, np.integer | int):
        return int(value)
    if isinstance(value, np.floating | float):
        if not np.isfinite(value):
            raise ValueError("non-finite number in the arena report")
        return round(float(value), 5)
    return value


_NUMBER = r"-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?"
_NUMBER_LIST = re.compile(rf"\[\s*(?:{_NUMBER}\s*,\s*)*{_NUMBER}\s*\]")


def dumps(report: dict) -> str:
    """Indented JSON with each list of numbers on one line (readable diffs, small file)."""
    text = json.dumps(clean(report), indent=2, allow_nan=False)
    return _NUMBER_LIST.sub(lambda m: re.sub(r"\s+", "", m.group(0)).replace(",", ", "), text) + "\n"
