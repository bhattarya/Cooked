"""Shock rates (§7.6), measured per term from alumni histories by work-hours band."""

from __future__ import annotations

from ml.snapshots import ATT, People, W

BANDS = ["0 h", "1–10 h", "11–20 h", "21–30 h", "31+ h"]


def band(work_hours: float) -> int:
    w = work_hours or 0
    return 0 if w == 0 else 1 if w <= 10 else 2 if w <= 20 else 3 if w <= 30 else 4


def measure_shocks(people: People) -> dict:
    counts = [{"terms": 0, "w_terms": 0, "pairs": 0, "drops": 0} for _ in BANDS]
    for cid in people.alumni_ids:
        t = people.terms_of(cid)
        c = counts[band(people.static.at[cid, "work_hours"])]
        for i, row in enumerate(t):
            c["terms"] += 1
            c["w_terms"] += int(row[W] > 0)
            if i:
                c["pairs"] += 1
                c["drops"] += int(t[i - 1, ATT] - row[ATT] >= 3)

    exp = people.experience
    total = max(len(exp), 1)
    outcomes = exp["outcome"].value_counts().to_dict() if len(exp) else {}

    out = people.alumni_out
    reported = out[out.first_destination != "No Response"]
    seeking = []
    for n in range(4):
        g = reported[reported.internship_count >= 3] if n == 3 else reported[
            reported.internship_count == n
        ]
        seeking.append(
            {
                "internships": n,
                "n": len(g),
                "rate": float((g.first_destination == "Still Seeking").mean()) if len(g) else 0.0,
            }
        )

    return {
        "bands": BANDS,
        "withdraw": [c["w_terms"] / max(c["terms"], 1) for c in counts],
        "lighter_load": [c["drops"] / max(c["pairs"], 1) for c in counts],
        "terms_observed": [c["terms"] for c in counts],
        "intern_ended_early": outcomes.get("Ended early", 0) / total,
        "intern_offer_declined": outcomes.get("Return offer declined", 0) / total,
        "seeking_by_internships": seeking,
    }
