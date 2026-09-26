"""Twin matcher (§7.4, §7.5): Gower-distance nearest alumni at the same stage.

A twin is an alum who, after the same number of completed terms, looked like the student:
same entry type and major, similar work hours, load, withdrawals and completion ratio.
We keep the largest set of nearest twins that stays within a distance caliper and whose
balance variables stay within 0.1 standardized mean difference of the student. Fewer than
30 such twins, or a profile outside the training range, is a refusal, not a guess.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from ml.snapshots import People, stage_features

MIN_SUPPORT = 30
CALIPER = 0.10
MAX_TWINS = 300
SMD_MAX = 0.1
K_MATCH_MAX = 8
NUMERIC = ["work_hours", "att_mean", "w_sum", "earned_ratio"]
CATEGORICAL = ["entry_transfer", "major_cs"]
BALANCE = ["work_hours", "att_mean"]


@dataclass
class TwinResult:
    k: int
    ids: list[str]
    n: int
    refused: bool
    reason: str | None = None
    max_distance: float | None = None
    smd: dict[str, float] = field(default_factory=dict)


class TwinIndex:
    """Stage-aligned alumni feature tables, built lazily per k."""

    def __init__(self, people: People):
        self.people = people
        self._by_k: dict[int, pd.DataFrame] = {}

    def table(self, k: int) -> pd.DataFrame:
        if k not in self._by_k:
            rows, ids = [], []
            static = self.people.static
            for cid in self.people.alumni_ids:
                t = self.people.terms_of(cid)
                if k > 0 and len(t) <= k:
                    continue  # graduated before this stage; not comparable to someone enrolled
                rows.append(stage_features(static.loc[cid], t, k))
                ids.append(cid)
            self._by_k[k] = pd.DataFrame(rows, index=ids)
        return self._by_k[k]

    def find(self, feats: dict[str, float], k: int, min_support: int = MIN_SUPPORT) -> TwinResult:
        k = min(k, K_MATCH_MAX)
        tab = self.table(k)
        for c in NUMERIC:
            lo, hi = tab[c].min(), tab[c].max()
            if not lo - 1e-9 <= feats[c] <= hi + 1e-9:
                return TwinResult(k, [], 0, True, f"{c} outside the training range")

        num = tab[NUMERIC].to_numpy(dtype=float)
        rng = num.max(axis=0) - num.min(axis=0)
        rng[rng == 0] = 1.0
        x = np.array([feats[c] for c in NUMERIC])
        d_num = np.abs(num - x) / rng
        d_cat = (tab[CATEGORICAL].to_numpy() != np.array([feats[c] for c in CATEGORICAL])).astype(
            float
        )
        dist = np.concatenate([d_num, d_cat], axis=1).mean(axis=1)

        order = np.argsort(dist, kind="stable")
        within = int((dist[order] <= CALIPER).sum())
        n_max = min(within, MAX_TWINS)
        if n_max < min_support:
            return TwinResult(k, [], within, True, f"only {within} close matches")

        bal = tab[BALANCE].to_numpy(dtype=float)[order[:n_max]]
        sd = tab[BALANCE].to_numpy(dtype=float).std(axis=0)
        sd[sd == 0] = 1.0
        target = np.array([feats[c] for c in BALANCE])
        means = np.cumsum(bal, axis=0) / np.arange(1, n_max + 1)[:, None]
        smd = np.abs(means - target) / sd
        ok = np.where((smd < SMD_MAX).all(axis=1))[0] + 1
        ok = ok[ok >= min_support]
        if not len(ok):
            return TwinResult(k, [], n_max, True, "matches not balanced on work hours and load")
        n = int(ok.max())
        chosen = order[:n]
        return TwinResult(
            k,
            tab.index[chosen].tolist(),
            n,
            False,
            None,
            float(dist[chosen].max()),
            {c: float(v) for c, v in zip(BALANCE, smd[n - 1])},
        )
