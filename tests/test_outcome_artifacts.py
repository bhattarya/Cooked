import json
from pathlib import Path

from ml.model_interface import Models
from ml.outcomes import CAREER_CLASSES, career_label

ROOT = Path(__file__).resolve().parents[1]


def test_four_model_artifact_is_frozen_and_temporally_evaluated():
    manifest = json.loads((ROOT / "models/manifest.json").read_text())
    assert manifest["outcome_metrics"]["career"]["n_train"] > 1000
    assert manifest["outcome_metrics"]["salary"]["n_train"] > 1000
    assert manifest["outcome_metrics"]["career"]["test_years"] == [2023, 2026]
    assert manifest["outcome_metrics"]["salary"]["test_years"] == [2023, 2026]
    models = Models.load(ROOT / "models")
    assert models.career_model is not None and models.salary_model is not None
    assert "pca" in models.autopsy


def test_unknown_and_tiny_career_outcomes_are_excluded_and_counted_separately():
    manifest = json.loads((ROOT / "models/manifest.json").read_text())
    career = manifest["outcome_metrics"]["career"]
    assert career["no_response_excluded"] == 480  # unknown, never a class
    assert career["military_excluded"] == 31  # known, but too small to be a class
    assert set(career["support"]) == set(CAREER_CLASSES)


def test_no_response_and_military_never_become_a_class():
    assert career_label("No Response") is None
    assert career_label("Military") is None
    assert {career_label(v) for v in ("Employed Full-Time", "Employed Part-Time")} == {"Employed"}
    assert career_label("Continuing Education") == "Continuing education"
    assert career_label("Still Seeking") == "Still seeking"
    models = Models.load(ROOT / "models")
    assert set(models.career_model["classes"]) == set(CAREER_CLASSES)
