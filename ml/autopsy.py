"""Autopsy (§7.4): cluster whole alumni histories into trajectory patterns and test stability."""

from __future__ import annotations

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score
from sklearn.preprocessing import StandardScaler

from ml.snapshots import People, history_features

N_CLUSTERS = 5
HIST_COLS = ["att_mean", "low_share", "w_per_term", "rep_per_term", "has_gap"]


def _name_clusters(centroids: np.ndarray) -> dict[int, str]:
    """Name by centroid (raw units): biggest gap share, then withdrawals, low load, repeats."""
    names: dict[int, str] = {}
    order = [(4, "stop-out"), (2, "withdrawal spiral"), (1, "part-time grind"), (3, "rough patch")]
    for col, name in order:
        left = [j for j in range(len(centroids)) if j not in names]
        names[max(left, key=lambda j: centroids[j, col])] = name
    for j in range(len(centroids)):
        names.setdefault(j, "smooth")
    return names


def fit_autopsy(people: People, seed: int = 7, boots: int = 20) -> dict:
    ids = people.alumni_ids
    X = np.array([history_features(people.terms_of(c), people.gaps.get(c, 0)) for c in ids])
    scaler = StandardScaler().fit(X)
    Z = scaler.transform(X)
    km = KMeans(N_CLUSTERS, n_init=20, random_state=seed).fit(Z)
    centroids = scaler.inverse_transform(km.cluster_centers_)
    names = _name_clusters(centroids)

    rng = np.random.default_rng(seed)
    aris, per_pattern = [], {n: [] for n in names.values()}
    for b in range(boots):
        idx = rng.integers(0, len(Z), len(Z))
        kb = KMeans(N_CLUSTERS, n_init=5, random_state=seed + b + 1).fit(Z[idx])
        lab_b = kb.predict(Z)
        aris.append(adjusted_rand_score(km.labels_, lab_b))
        for j, name in names.items():
            ref = km.labels_ == j
            # best Jaccard overlap of this pattern with any bootstrap cluster
            best = max(
                (ref & (lab_b == c)).sum() / max((ref | (lab_b == c)).sum(), 1)
                for c in range(N_CLUSTERS)
            )
            per_pattern[name].append(float(best))

    labels = {c: names[int(l)] for c, l in zip(ids, km.labels_)}
    stats = {}
    for j, name in names.items():
        members = [c for c, l in zip(ids, km.labels_) if l == j]
        s = people.static.loc[members]
        stats[name] = {
            "n": len(members),
            "share": len(members) / len(ids),
            "centroid": dict(zip(HIST_COLS, map(float, centroids[j]))),
            "ttd_mean": float(s["ttd"].mean()),
            "cooked_rate": float(s["cooked"].mean()),
            "work_mean": float(s["work_hours"].mean()),
            "stability_jaccard": float(np.mean(per_pattern[name])),
        }
    return {
        "scaler": scaler,
        "kmeans": km,
        "names": names,
        "labels": labels,
        "stats": stats,
        "stability": {"ari_mean": float(np.mean(aris)), "ari_min": float(np.min(aris))},
    }


def assign_pattern(autopsy: dict, terms: np.ndarray, gaps: int) -> str | None:
    """Nearest autopsy centroid for a (possibly partial) history; None before any term."""
    if not len(terms):
        return None
    z = autopsy["scaler"].transform([history_features(terms, gaps)])
    return autopsy["names"][int(autopsy["kmeans"].predict(z)[0])]
