"""The one model boundary (§5.4). API, worker, tests and notebooks all score through here.

Artifacts are frozen: `models/manifest.json` records the SHA-256 of every artifact file, and
loading refuses a missing or modified file.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from threadpoolctl import threadpool_limits  # a scikit-learn dependency, already installed

from ml.candidates import FAMILIES
from ml.risk_model import QUANTILES, calibrated
from ml.snapshots import FEATURES, K_MAX

ARTIFACT = "cooked-v1.joblib"
MANIFEST = "manifest.json"
ARENA = "arena.json"
THRESHOLD = 0.5  # P(cooked) at or above this counts as cooked for the drill


class ArtifactError(RuntimeError):
    """Artifacts are missing, or do not match their recorded checksum."""


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def verify(directory: Path) -> dict:
    manifest_path = directory / MANIFEST
    if not manifest_path.exists():
        raise ArtifactError("not_configured")
    manifest = json.loads(manifest_path.read_text())
    for name, expected in manifest["files"].items():
        path = directory / name
        if not path.exists():
            raise ArtifactError(f"missing artifact {name}")
        if sha256(path) != expected:
            raise ArtifactError(f"checksum mismatch for {name}")
    return manifest


class Models:
    def __init__(self, bundle: dict, manifest: dict):
        # The API scores one scenario at a time. Fanning a single-row gradient-boosting predict
        # out over OpenMP threads is ~20x slower than one thread (measured 19 ms vs 1 ms), so
        # every process that loads models for inference runs OpenMP single-threaded.
        threadpool_limits(limits=1, user_api="openmp")
        self.bundle = bundle
        self.manifest = manifest
        self.version: str = manifest["version"]
        self.risk_models = bundle["risk"]
        self.ttd_models = bundle["ttd"]
        self.career_model = bundle.get("career")
        self.salary_model = bundle.get("salary")
        self.arena_models = bundle.get("arena")  # every competing candidate, keyed by task, family
        self.champions: dict[str, str] = bundle.get("champions", {})
        self.arena_report: dict | None = None  # models/arena.json, set by load()
        self.autopsy = bundle["autopsy"]
        self.shocks = bundle["shocks"]
        self.threshold = THRESHOLD
        # §7.5: if calibration failed its gate, show ranks instead of probabilities
        self.calibrated_ok = bool(manifest["gates"]["risk_calibration"]["pass"])

    @classmethod
    def load(cls, directory: str | Path) -> Models:
        directory = Path(directory)
        manifest = verify(directory)
        models = cls(joblib.load(directory / ARTIFACT), manifest)
        if ARENA in manifest["files"]:  # checksum already verified above
            models.arena_report = json.loads((directory / ARENA).read_text())
        return models

    @staticmethod
    def _by_k(X: pd.DataFrame, fn) -> np.ndarray:
        X = X[FEATURES]
        out = np.zeros((len(X),) + fn.shape_suffix)
        ks = np.minimum(X["k"].to_numpy().astype(int), K_MAX)
        for k in np.unique(ks):
            rows = ks == k
            out[rows] = fn(int(k), X[rows])
        return out

    @classmethod
    def _risk(cls, table: dict, X: pd.DataFrame) -> np.ndarray:
        def f(k, x):
            return calibrated(table[k], x)

        f.shape_suffix = ()
        return cls._by_k(X, f)

    @classmethod
    def _ttd(cls, table: dict, X: pd.DataFrame) -> np.ndarray:
        def f(k, x):
            qs = table[k]
            return np.column_stack([qs[q].predict(x) for q in sorted(qs)])

        f.shape_suffix = (len(QUANTILES),)
        return np.sort(cls._by_k(X, f), axis=1)

    def risk(self, X: pd.DataFrame) -> np.ndarray:
        return self._risk(self.risk_models, X)

    def ttd(self, X: pd.DataFrame) -> np.ndarray:
        """(n, 3) predicted time-to-degree quantiles p25, p50, p75, forced monotone."""
        return self._ttd(self.ttd_models, X)

    def pattern(self, terms: np.ndarray, gaps: int) -> str | None:
        from ml.autopsy import assign_pattern

        return assign_pattern(self.autopsy, terms, gaps)

    def career(self, X: pd.DataFrame) -> dict[str, float]:
        return _class_probabilities(self.career_model["model"], X)

    def salary_range(self, X: pd.DataFrame) -> np.ndarray:
        return _quantile_row(self.salary_model["models"], X)

    # ---- the arena: every competing family scoring the same input ----
    def _arena(self) -> dict:
        if self.arena_models is None:
            raise ArtifactError("arena candidates missing; run: make train")
        return self.arena_models

    def risk_by_family(self, X: pd.DataFrame) -> dict[str, np.ndarray]:
        table = self._arena()["risk"]
        return {f: self._risk(table[f], X) for f in FAMILIES}

    def ttd_by_family(self, X: pd.DataFrame) -> dict[str, np.ndarray]:
        table = self._arena()["ttd"]
        return {f: self._ttd(table[f], X) for f in FAMILIES}

    def career_by_family(self, X: pd.DataFrame) -> dict[str, dict[str, float]]:
        table = self._arena()["career"]
        return {f: _class_probabilities(table[f]["model"], X) for f in FAMILIES}

    def salary_by_family(self, X: pd.DataFrame) -> dict[str, np.ndarray]:
        table = self._arena()["salary"]
        return {f: _quantile_row(table[f]["models"], X) for f in FAMILIES}


def _class_probabilities(model, X: pd.DataFrame) -> dict[str, float]:
    return {str(c): float(v) for c, v in zip(model.classes_, model.predict_proba(X)[0], strict=True)}


def _quantile_row(models: dict, X: pd.DataFrame) -> np.ndarray:
    return np.sort([models[q].predict(X)[0] for q in sorted(models)])
