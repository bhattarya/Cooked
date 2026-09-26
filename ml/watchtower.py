"""Watchtower (§8.1): score every current student and decide alarms with hysteresis."""

from __future__ import annotations

import pandas as pd

from ml.model_interface import Models
from ml.snapshots import FEATURES, People, stage_features

OPEN_AT = 0.35  # risk at or above this opens an alarm
CLOSE_BELOW = 0.25  # an open alarm resolves only once risk falls below this
LEAD_BASE_TERMS = 8  # four-year mark, in regular terms


def hysteresis(is_open: bool, risk: float) -> str:
    """'open', 'resolve' or 'keep'. The gap between thresholds stops a hovering risk flapping."""
    if not is_open and risk >= OPEN_AT:
        return "open"
    if is_open and risk < CLOSE_BELOW:
        return "resolve"
    return "keep"


def score_all(people: People, models: Models, min_terms: int = 1) -> pd.DataFrame:
    """Batch-score current students with at least `min_terms` completed terms."""
    rows, ids = [], []
    for cid in people.current_ids:
        t = people.terms_of(cid)
        if len(t) < min_terms:
            continue
        rows.append(stage_features(people.static.loc[cid], t, min(len(t), 6)))
        ids.append(cid)
    X = pd.DataFrame(rows, columns=FEATURES)
    out = pd.DataFrame({"campus_id": ids, "k": [len(people.terms_of(c)) for c in ids]})
    out["risk"] = models.risk(X)
    out["pattern"] = [models.pattern(people.terms_of(c), people.gaps.get(c, 0)) for c in ids]
    out["lead_time_terms"] = (LEAD_BASE_TERMS - out["k"]).clip(lower=0)
    return out
