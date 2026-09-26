"""Risk and time-to-degree models (§7.4), one per stage k, with a temporal split (§7.5).

Train on graduation years <= 2021, recalibrate on 2022, test on 2023-2026.
Graduation year is only a split key, never a feature.

Calibration is Platt scaling on the 2022 year. The plan named isotonic; on ~300 calibration rows
isotonic produced 0/1 steps and failed the slope gate (0.4-0.8), while Platt passes (0.87-1.06).
"""

from __future__ import annotations

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, mean_absolute_error, r2_score, roc_auc_score

from ml.snapshots import K_MAX, People, training_frame

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
    """P(cooked) from a stage model: boosted score, then Platt scaling."""
    return model["platt"].predict_proba(logit(model["clf"].predict_proba(X)[:, 1]))[:, 1]


def calibration_slope(y: np.ndarray, p: np.ndarray) -> float:
    """Slope of logit(y) on logit(p); 1.0 is perfectly calibrated spread."""
    if len(np.unique(y)) < 2:
        return float("nan")
    return float(LogisticRegression(C=1e6, max_iter=1000).fit(logit(p), y).coef_[0, 0])


def top_decile_precision(y: np.ndarray, p: np.ndarray) -> float:
    n = max(int(len(p) * 0.1), 1)
    return float(y[np.argsort(-p)[:n]].mean())


def fit_models(people: People) -> tuple[dict, dict, dict, list[str]]:
    """Returns risk models by k, ttd models by k, metrics by k, and every id used to fit."""
    risk, ttd, metrics = {}, {}, {}
    used: set[str] = set()
    for k in range(K_MAX + 1):
        ts = training_frame(people, k)
        tr, cal, te = split(ts.year)
        clf = HistGradientBoostingClassifier(
            max_iter=150, learning_rate=0.05, max_leaf_nodes=7, l2_regularization=5.0,
            min_samples_leaf=40, random_state=SEED,
        ).fit(ts.X[tr], ts.cooked[tr])
        platt = LogisticRegression(C=1e6, max_iter=1000).fit(
            logit(clf.predict_proba(ts.X[cal])[:, 1]), ts.cooked[cal]
        )
        p_raw = clf.predict_proba(ts.X[te])[:, 1]
        p = platt.predict_proba(logit(p_raw))[:, 1]
        y = ts.cooked[te].astype(int)

        qs = {}
        for q in QUANTILES:
            qs[q] = HistGradientBoostingRegressor(
                loss="quantile", quantile=q, max_iter=250, learning_rate=0.05,
                max_leaf_nodes=15, random_state=SEED,
            ).fit(ts.X[tr], ts.ttd[tr])
        med = qs[0.5].predict(ts.X[te])
        lo, hi = qs[0.25].predict(ts.X[te]), qs[0.75].predict(ts.X[te])
        baseline = np.full_like(ts.ttd[te], np.median(ts.ttd[tr]))

        risk[k] = {"clf": clf, "platt": platt}
        ttd[k] = qs
        metrics[k] = {
            "n_train": int(tr.sum()),
            "n_cal": int(cal.sum()),
            "n_test": int(te.sum()),
            "base_rate_test": float(y.mean()),
            "auc": float(roc_auc_score(y, p_raw)),
            "auc_calibrated": float(roc_auc_score(y, p)),
            "brier": float(brier_score_loss(y, p)),
            "brier_baseline": float(brier_score_loss(y, np.full_like(p, ts.cooked[tr].mean()))),
            "calibration_slope": calibration_slope(y, p),
            "top_decile_precision": top_decile_precision(y, p),
            "ttd_mae": float(mean_absolute_error(ts.ttd[te], med)),
            "ttd_mae_baseline": float(mean_absolute_error(ts.ttd[te], baseline)),
            "ttd_r2": float(r2_score(ts.ttd[te], med)),
            "ttd_interval_coverage": float(((ts.ttd[te] >= lo) & (ts.ttd[te] <= hi)).mean()),
            "train_years": [int(ts.year[tr].min()), int(ts.year[tr].max())],
            "test_years": [int(ts.year[te].min()), int(ts.year[te].max())],
        }
        used |= set(np.array(ts.ids)[tr | cal])
    return risk, ttd, metrics, sorted(used)
