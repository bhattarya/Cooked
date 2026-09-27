"""Split rules and calibration helpers for the risk and time-to-degree models (§7.4, §7.5).

Train on graduation years <= 2021, recalibrate on 2022, test on 2023-2026.
Graduation year is only a split key, never a feature. The models themselves are fitted and
compared by ml/arena.py; the competing families are defined in ml/candidates.py.

Calibration is Platt scaling on the 2022 year. The plan named isotonic; on ~300 calibration rows
isotonic produced 0/1 steps and failed the slope gate (0.4-0.8), while Platt passes (0.87-1.06).
"""

from __future__ import annotations

import numpy as np
from sklearn.linear_model import LogisticRegression

TRAIN_MAX_YEAR = 2021
CAL_YEAR = 2022
TEST_MIN_YEAR = 2023
QUANTILES = (0.25, 0.5, 0.75)
SEED = 7


def split(years: np.ndarray):
    train = years <= TRAIN_MAX_YEAR
    cal = years == CAL_YEAR
    test = years >= TEST_MIN_YEAR
    return train, cal, test


def logit(p: np.ndarray) -> np.ndarray:
    p = np.clip(np.asarray(p, dtype=float), 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p)).reshape(-1, 1)


def calibrated(model: dict, X) -> np.ndarray:
    """P(cooked) from a stage model: the classifier's score, then Platt scaling.

    The naive baseline is a constant prior and needs no calibration (`platt` is None).
    """
    raw = model["clf"].predict_proba(X)[:, 1]
    if model["platt"] is None:
        return raw
    return model["platt"].predict_proba(logit(raw))[:, 1]


def calibration_slope(y: np.ndarray, p: np.ndarray) -> float:
    """Slope of logit(y) on logit(p); 1.0 is perfectly calibrated spread."""
    if len(np.unique(y)) < 2:
        return float("nan")
    return float(LogisticRegression(C=1e6, max_iter=1000).fit(logit(p), y).coef_[0, 0])


def top_decile_precision(y: np.ndarray, p: np.ndarray) -> float:
    n = max(int(len(p) * 0.1), 1)
    return float(y[np.argsort(-p)[:n]].mean())
