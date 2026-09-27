"""Stage-aligned snapshots (§7.2).

One builder serves both populations: alumni are rebuilt "as of after k regular terms" for
training, and current students are scored at k = their completed regular terms. Only data that
exists at that point in time may become a feature; everything else is quarantined (§7.1).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

# §7.1 quarantine: labels, outcomes and anything downstream of delay. Never features.
QUARANTINE = frozenset(
    {
        "time_to_degree_years",
        "cooked",
        "first_destination",
        "first_job_annual_salary_usd",
        "net_cost_usd",
        "total_loans_usd",
        "total_credits_earned",
        "final_gpa",
        "major_gpa",
        "graduation_term",
        "graduation_year",
        "months_to_first_job",
        "first_job_title",
        "first_job_family",
        "first_employer",
        "is_first_generation",
        "academic_standing",
        "expected_graduation_term",
        "mode",
    }
)

STATIC = ["entry_transfer", "out_of_state", "work_hours", "major_cs"]
BEHAVIOUR = [
    "k",
    "att_mean",
    "earned_mean",
    "att_min",
    "att_last",
    "low_share",
    "w_sum",
    "f_sum",
    "rep_sum",
    "earned_ratio",
]
FEATURES = STATIC + BEHAVIOUR
FEATURE_LABELS = {
    "entry_transfer": "Entered as a transfer student",
    "out_of_state": "Out-of-state resident",
    "work_hours": "Weekly work hours",
    "major_cs": "Computer Science major",
    "k": "Terms completed",
    "att_mean": "Average credits attempted per term",
    "earned_mean": "Average credits earned per term",
    "att_min": "Lightest term load",
    "att_last": "Most recent term load",
    "low_share": "Share of terms under 12 credits",
    "w_sum": "Total withdrawals",
    "f_sum": "Total failed courses",
    "rep_sum": "Total repeated courses",
    "earned_ratio": "Share of attempted credits earned",
    "internship_count": "Internships",
    "credential_count": "Credentials earned",
    "engagement_count": "Campus engagement activities",
}
K_MAX = 6  # models exist for k = 0..K_MAX; later students use K_MAX with their first K_MAX terms

# columns of a term row
ATT, EARNED, W, F, REP = range(5)


@dataclass
class People:
    """Everything the models and tools need, loaded once from the feat schema."""

    static: pd.DataFrame  # index campus_id
    terms: dict[str, np.ndarray]  # campus_id -> (n_terms, 5) ordered by k
    gaps: dict[str, int]
    alumni_out: pd.DataFrame  # index campus_id; outcome columns, alumni only
    current_extra: pd.DataFrame  # index campus_id; current students only
    courses_done: dict[str, set[str]] = field(default_factory=dict)
    courses_ip: dict[str, list[str]] = field(default_factory=dict)
    catalog: pd.DataFrame = field(default_factory=pd.DataFrame)
    experience: pd.DataFrame = field(default_factory=pd.DataFrame)

    @property
    def alumni_ids(self) -> list[str]:
        return self.static.index[self.static.population == "alumni"].tolist()

    @property
    def current_ids(self) -> list[str]:
        """Dataset students only; profiles built from uploaded audits (USR-...) never count."""
        cur = self.static.index[self.static.population == "current"]
        return [c for c in cur if c.startswith("CID-")]

    def terms_of(self, cid: str) -> np.ndarray:
        return self.terms.get(cid, np.zeros((0, 5)))


def load_people(conn) -> People:
    """Read the typed feat schema (the app_rw role is sufficient)."""

    def frame(sql: str) -> pd.DataFrame:
        cur = conn.execute(sql)
        cols = [c.name for c in cur.description]
        return pd.DataFrame(cur.fetchall(), columns=cols)

    static = frame(
        "SELECT campus_id, population, major, track, entry_type, residency, work_hours, "
        "graduation_year, time_to_degree_years::float AS ttd, cooked FROM feat.person_static"
    ).set_index("campus_id")

    pt = frame(
        "SELECT campus_id, k, term_idx, credits_attempted, credits_earned, w_count, f_count, "
        "repeat_count FROM feat.person_term ORDER BY campus_id, k"
    )
    terms: dict[str, np.ndarray] = {}
    gaps: dict[str, int] = {}
    for cid, g in pt.groupby("campus_id", sort=False):
        terms[cid] = g[
            ["credits_attempted", "credits_earned", "w_count", "f_count", "repeat_count"]
        ].to_numpy(dtype=float)
        idx = g["term_idx"].to_numpy()
        gaps[cid] = int(idx.max() - idx.min() + 1 - len(idx))

    alumni_out = frame(
        "SELECT campus_id, first_destination, first_job_annual_salary_usd::float AS salary, "
        "net_cost_usd::float AS net_cost, internship_count, credential_count, "
        "engagement_activity_count AS engagement_count, graduation_year FROM feat.alumni"
    ).set_index("campus_id")

    current_extra = frame(
        "SELECT campus_id, credits_earned, credits_required, internship_count, class_level, "
        "entry_term, expected_graduation_term FROM feat.students_current"
    ).set_index("campus_id")

    tx = frame(
        "SELECT t.campus_id, t.course_id, t.grade, t.credits_earned FROM feat.transcripts t "
        "JOIN feat.person_static s USING (campus_id) WHERE s.population = 'current'"
    )
    done: dict[str, set[str]] = {}
    ip: dict[str, list[str]] = {}
    for row in tx.itertuples(index=False):
        if row.grade == "IP":
            ip.setdefault(row.campus_id, []).append(row.course_id)
        elif (row.credits_earned or 0) > 0:
            done.setdefault(row.campus_id, set()).add(row.course_id)

    catalog = frame(
        "SELECT course_id, subject, course_title, credits, course_type, required_for_majors, "
        "prerequisite_ids, typical_terms_offered FROM feat.course_catalog"
    ).set_index("course_id")

    experience = frame(
        "SELECT campus_id, experience_type, outcome FROM feat.student_experience "
        "WHERE experience_type IN ('Internship', 'Co-op')"
    )

    return People(static, terms, gaps, alumni_out, current_extra, done, ip, catalog, experience)


def stage_features(static_row, terms: np.ndarray, k: int) -> dict[str, float]:
    """Features known after k completed regular terms. `terms` may be longer; only k are used."""
    t = terms[:k]
    n = len(t)
    feats = {
        "entry_transfer": float(static_row["entry_type"] == "Transfer"),
        "out_of_state": float(static_row["residency"] == "Out-of-State"),
        "work_hours": float(static_row["work_hours"] or 0),
        "major_cs": float(static_row["major"] == "Computer Science"),
        "k": float(k),
    }
    if n == 0:
        feats.update({c: 0.0 for c in BEHAVIOUR if c != "k"})
        return feats
    att = t[:, ATT]
    earned = t[:, EARNED]
    feats.update(
        {
            "att_mean": float(att.mean()),
            "earned_mean": float(earned.mean()),
            "att_min": float(att.min()),
            "att_last": float(att[-1]),
            "low_share": float((att < 12).mean()),
            "w_sum": float(t[:, W].sum()),
            "f_sum": float(t[:, F].sum()),
            "rep_sum": float(t[:, REP].sum()),
            "earned_ratio": float(earned.sum() / att.sum()) if att.sum() else 0.0,
        }
    )
    return feats


def snapshot(people: People, cid: str, k: int | None = None, extra_terms=None) -> pd.DataFrame:
    """One-row feature frame for a person; `extra_terms` appends hypothetical future terms."""
    terms = people.terms_of(cid)
    if extra_terms is not None and len(extra_terms):
        terms = np.vstack([terms, np.asarray(extra_terms, dtype=float)])
    k = len(terms) if k is None else k
    k = min(k, K_MAX)
    return pd.DataFrame([stage_features(people.static.loc[cid], terms, k)], columns=FEATURES)


@dataclass
class TrainingSet:
    X: pd.DataFrame
    cooked: np.ndarray
    ttd: np.ndarray
    year: np.ndarray
    ids: list[str]


def training_frame(people: People, k: int) -> TrainingSet:
    """Alumni still enrolled after k terms (n_terms > k), described only by what was known then."""
    rows, cooked, ttd, year, ids = [], [], [], [], []
    alumni = people.static[people.static.population == "alumni"]
    for cid, s in alumni.iterrows():
        t = people.terms_of(cid)
        if k > 0 and len(t) <= k:
            continue
        rows.append(stage_features(s, t, k))
        cooked.append(bool(s["cooked"]))
        ttd.append(float(s["ttd"]))
        year.append(int(s["graduation_year"]))
        ids.append(cid)
    return TrainingSet(
        pd.DataFrame(rows, columns=FEATURES),
        np.array(cooked),
        np.array(ttd),
        np.array(year),
        ids,
    )


def history_features(terms: np.ndarray, gaps: int) -> list[float]:
    """Per-term normalised whole-history features for the autopsy clusters."""
    n = max(len(terms), 1)
    if not len(terms):
        return [0.0, 0.0, 0.0, 0.0, float(gaps > 0)]
    return [
        float(terms[:, ATT].mean()),
        float((terms[:, ATT] < 12).mean()),
        float(terms[:, W].sum() / n),
        float(terms[:, REP].sum() / n),
        float(gaps > 0),
    ]
