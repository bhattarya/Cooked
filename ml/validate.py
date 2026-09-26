"""Go/no-go gates (§7.5). A failed gate drops the claim, it never silently passes."""

from __future__ import annotations

from ml.risk_model import TEST_MIN_YEAR, TRAIN_MAX_YEAR
from ml.snapshots import FEATURES, QUARANTINE

AUC_MIN = 0.85
SLOPE_RANGE = (0.8, 1.2)
ARI_MIN = 0.7


def gates(metrics: dict, autopsy: dict, training_ids: list[str], current_ids: list[str]) -> dict:
    leaked = sorted(set(FEATURES) & QUARANTINE)
    train_max = max(m["train_years"][1] for m in metrics.values())
    test_min = min(m["test_years"][0] for m in metrics.values())
    overlap = sorted(set(training_ids) & set(current_ids))
    slopes = {k: m["calibration_slope"] for k, m in metrics.items() if k <= 3}
    return {
        "no_leakage": {"pass": not leaked, "leaked": leaked},
        "temporal_integrity": {
            "pass": train_max < test_min and train_max <= TRAIN_MAX_YEAR and test_min >= TEST_MIN_YEAR,
            "max_train_year": train_max,
            "min_test_year": test_min,
        },
        "no_current_in_training": {"pass": not overlap, "overlap": len(overlap)},
        "risk_discrimination": {
            "pass": metrics[1]["auc"] >= AUC_MIN,
            "threshold": AUC_MIN,
            "auc_after_one_term": metrics[1]["auc"],
            "auc_enrollment_only": metrics[0]["auc"],
            "note": "Headline the enrollment-only AUC: the cooked label is partly defined by load.",
        },
        "risk_calibration": {
            "pass": all(SLOPE_RANGE[0] <= s <= SLOPE_RANGE[1] for s in slopes.values()),
            "range": list(SLOPE_RANGE),
            "slopes": slopes,
            "brier": {k: m["brier"] for k, m in metrics.items() if k <= 3},
        },
        "cluster_stability": {
            "pass": autopsy["stability"]["ari_mean"] >= ARI_MIN,
            "threshold": ARI_MIN,
            **autopsy["stability"],
            "per_pattern_jaccard": {n: s["stability_jaccard"] for n, s in autopsy["stats"].items()},
        },
    }
