"""Train, validate and freeze every COOKED model: python -m ml.train

Reads the loaded feat schema, fits the stage models, clusters and shock rates, evaluates the
§7.5 gates, and writes models/cooked-v1.joblib plus models/manifest.json (checksums, metrics,
gates). The API refuses to start on a checksum mismatch.
"""

from __future__ import annotations

import json
import platform
from datetime import UTC, datetime

import joblib
import numpy as np
import sklearn

from ml.autopsy import fit_autopsy
from ml.model_interface import ARTIFACT, MANIFEST, Models, sha256
from ml.risk_model import fit_models
from ml.shocks import measure_shocks
from ml.snapshots import FEATURES, load_people, stage_features
from ml.twins import TwinIndex
from ml.validate import gates
from scripts.common import ROOT, connect, run

OUT = ROOT / "models"


def main():
    with connect("DATABASE_URL_APP") as conn:
        people = load_people(conn)
    print(f"Loaded {len(people.alumni_ids)} alumni and {len(people.current_ids)} current students")

    risk, ttd, metrics, training_ids = fit_models(people)
    autopsy = fit_autopsy(people)
    shocks = measure_shocks(people)
    g = gates(metrics, autopsy, training_ids, people.current_ids)

    OUT.mkdir(exist_ok=True)
    bundle = {"risk": risk, "ttd": ttd, "autopsy": autopsy, "shocks": shocks, "features": FEATURES}
    joblib.dump(bundle, OUT / ARTIFACT, compress=3)
    (OUT / "training_ids.json").write_text(json.dumps(training_ids))

    version = "cooked-v1-" + datetime.now(UTC).strftime("%Y%m%d%H%M")
    manifest = {
        "version": version,
        "trained_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "python": platform.python_version(),
        "sklearn": sklearn.__version__,
        "numpy": np.__version__,
        "features": FEATURES,
        "files": {
            ARTIFACT: sha256(OUT / ARTIFACT),
            "training_ids.json": sha256(OUT / "training_ids.json"),
        },
        "metrics": {str(k): v for k, v in metrics.items()},
        "autopsy": {"stats": autopsy["stats"], "stability": autopsy["stability"]},
        "shocks": shocks,
        "gates": g,
    }
    (OUT / MANIFEST).write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")

    # twin-support coverage across current students (reported, not gated)
    models = Models.load(OUT)
    index = TwinIndex(people)
    scored = supported = 0
    for cid in people.current_ids:
        k = len(people.terms_of(cid))
        if k < 1:
            continue
        scored += 1
        feats = stage_features(people.static.loc[cid], people.terms_of(cid), k)
        supported += not index.find(feats, k).refused
    manifest["twin_support_coverage"] = {"scored": scored, "supported": supported}
    (OUT / MANIFEST).write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    del models

    print(f"Wrote {ARTIFACT} ({(OUT / ARTIFACT).stat().st_size / 1e6:.1f} MB), version {version}")
    for k, m in metrics.items():
        print(
            f"  k={k}: AUC {m['auc']:.3f}  Brier {m['brier']:.3f}  slope "
            f"{m['calibration_slope']:.2f}  TTD MAE {m['ttd_mae']:.2f}y (baseline "
            f"{m['ttd_mae_baseline']:.2f})"
        )
    for name, gate in g.items():
        print(f"  gate {name}: {'PASS' if gate['pass'] else 'FAIL'}")
    print(f"  twin support: {supported}/{scored} current students with 1+ terms")


if __name__ == "__main__":
    run(main)
