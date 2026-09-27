"""Frames for the career-destination and first-salary tasks over completed synthetic alumni.

These tasks answer planning questions about an end-of-degree scenario: what the first
destination and first salary looked like for alumni with a similar degree record. They are
associational, never causal. No Response is unknown, not an outcome, so it never becomes a
class; Military is a known outcome but too small (31 alumni) for a class of its own. Both are
excluded from the career task and counted separately. First salary exists only for alumni who
were employed. The temporal holdout keeps recent graduates unseen: train through 2022, test
2023-2026. ml/arena.py fits and compares the model families.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from ml.snapshots import FEATURES, K_MAX, People, stage_features

EXTRA_FEATURES = ["internship_count", "credential_count", "engagement_count"]
OUTCOME_FEATURES = FEATURES + EXTRA_FEATURES
CAREER_CLASSES = ["Employed", "Continuing education", "Still seeking"]
OUTCOME_TRAIN_MAX_YEAR = 2022
OUTCOME_TEST_MIN_YEAR = 2023


def career_label(value: str) -> str | None:
    """Three-class career label; None for No Response and Military (never a class)."""
    if value in {"Employed Full-Time", "Employed Part-Time"}:
        return "Employed"
    if value == "Continuing Education":
        return "Continuing education"
    if value == "Still Seeking":
        return "Still seeking"
    return None


@dataclass
class OutcomeSet:
    X: pd.DataFrame
    destination: np.ndarray  # object; a CAREER_CLASSES label, or None when excluded
    raw_destination: np.ndarray  # the dataset's first_destination, for exclusion counts
    salary: np.ndarray  # first-job salary in nominal dollars, NaN unless employed
    year: np.ndarray
    ids: list[str]


def outcome_frame(people: People) -> OutcomeSet:
    rows, destination, raw, salary, years, ids = [], [], [], [], [], []
    for cid in people.alumni_ids:
        out = people.alumni_out.loc[cid]
        feats = stage_features(people.static.loc[cid], people.terms_of(cid), K_MAX)
        feats.update(
            internship_count=float(out.get("internship_count") or 0),
            credential_count=float(out.get("credential_count") or 0),
            engagement_count=float(out.get("engagement_count") or 0),
        )
        rows.append(feats)
        raw.append(str(out.get("first_destination")))
        destination.append(career_label(raw[-1]))
        salary.append(float(out.get("salary")) if pd.notna(out.get("salary")) else np.nan)
        years.append(int(out.get("graduation_year")))
        ids.append(cid)
    return OutcomeSet(
        pd.DataFrame(rows, columns=OUTCOME_FEATURES),
        np.array(destination, dtype=object),
        np.array(raw, dtype=object),
        np.array(salary),
        np.array(years),
        ids,
    )


def scenario_outcome_features(
    base: dict[str, float], internships: int, credentials: int, engagement: int
) -> pd.DataFrame:
    row = {
        **base,
        "internship_count": internships,
        "credential_count": credentials,
        "engagement_count": engagement,
    }
    return pd.DataFrame([row], columns=OUTCOME_FEATURES)
