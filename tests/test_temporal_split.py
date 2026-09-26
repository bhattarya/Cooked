import json

import numpy as np

from ml.risk_model import CAL_YEAR, TEST_MIN_YEAR, TRAIN_MAX_YEAR, split
from scripts.common import ROOT


def test_split_is_strictly_temporal():
    years = np.arange(2015, 2027)
    train, cal, test = split(years)
    assert years[train].max() < years[cal].min() == CAL_YEAR < years[test].min()
    assert not (train & test).any() and not (cal & test).any()
    assert TRAIN_MAX_YEAR < CAL_YEAR < TEST_MIN_YEAR


def test_every_frozen_stage_model_trained_before_it_was_tested():
    manifest = json.loads((ROOT / "models/manifest.json").read_text())
    for k, m in manifest["metrics"].items():
        assert m["train_years"][1] < m["test_years"][0], k
    assert manifest["gates"]["temporal_integrity"]["pass"]
