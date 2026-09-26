import json

from ml.snapshots import FEATURES, QUARANTINE, STATIC, stage_features
from scripts.common import ROOT


def test_features_exclude_quarantined_columns():
    assert not set(FEATURES) & QUARANTINE


def test_stage_features_only_use_terms_up_to_k():
    import numpy as np
    import pandas as pd

    static = pd.Series({"entry_type": "Transfer", "residency": "In-State", "work_hours": 20, "major": "Computer Science"})
    early = np.array([[12, 12, 0, 0, 0], [9, 9, 1, 0, 0]], dtype=float)
    later = np.vstack([early, [[3, 0, 3, 3, 3]] * 4])  # a disastrous future must not leak into k=2
    assert stage_features(static, early, 2) == stage_features(static, later, 2)
    assert set(STATIC) <= set(stage_features(static, early, 0))


def test_frozen_manifest_uses_the_same_feature_list():
    manifest = json.loads((ROOT / "models/manifest.json").read_text())
    assert manifest["features"] == FEATURES
    assert manifest["gates"]["no_leakage"]["pass"]
