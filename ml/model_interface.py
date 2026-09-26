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

from ml.risk_model import calibrated
from ml.snapshots import FEATURES, K_MAX

ARTIFACT = "cooked-v1.joblib"
MANIFEST = "manifest.json"
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
        self.bundle = bundle
        self.manifest = manifest
        self.version: str = manifest["version"]
        self.risk_models = bundle["risk"]
        self.ttd_models = bundle["ttd"]
        self.autopsy = bundle["autopsy"]
        self.shocks = bundle["shocks"]
        self.threshold = THRESHOLD
        # §7.5: if calibration failed its gate, show ranks instead of probabilities
        self.calibrated_ok = bool(manifest["gates"]["risk_calibration"]["pass"])

    @classmethod
    def load(cls, directory: str | Path) -> Models:
        directory = Path(directory)
        manifest = verify(directory)
        return cls(joblib.load(directory / ARTIFACT), manifest)

    def _by_k(self, X: pd.DataFrame, fn) -> np.ndarray:
        X = X[FEATURES]
        out = np.zeros((len(X),) + fn.shape_suffix)
        ks = np.minimum(X["k"].to_numpy().astype(int), K_MAX)
        for k in np.unique(ks):
            rows = ks == k
            out[rows] = fn(int(k), X[rows])
        return out

    def risk(self, X: pd.DataFrame) -> np.ndarray:
        def f(k, x):
            return calibrated(self.risk_models[k], x)

        f.shape_suffix = ()
        return self._by_k(X, f)

    def ttd(self, X: pd.DataFrame) -> np.ndarray:
        """(n, 3) predicted time-to-degree quantiles p25, p50, p75, forced monotone."""

        def f(k, x):
            qs = self.ttd_models[k]
            return np.column_stack([qs[q].predict(x) for q in sorted(qs)])

        f.shape_suffix = (3,)
        return np.sort(self._by_k(X, f), axis=1)

    def pattern(self, terms: np.ndarray, gaps: int) -> str | None:
        from ml.autopsy import assign_pattern

        return assign_pattern(self.autopsy, terms, gaps)
