"""Small synthetic People builders for unit tests (no database needed)."""

import numpy as np
import pandas as pd

from ml.snapshots import People


def make_people(n_alumni: int, work: int = 10, load: float = 15.0, n_terms: int = 8) -> People:
    rows = []
    terms = {}
    for i in range(n_alumni):
        cid = f"CID-{900000 + i:06d}"
        rows.append(
            {"campus_id": cid, "population": "alumni", "major": "Computer Science", "track": "General",
             "entry_type": "First-Time Freshman", "residency": "In-State", "work_hours": work + (i % 3) - 1,
             "graduation_year": 2020, "ttd": 4.0, "cooked": False}
        )
        terms[cid] = np.array([[load, load, 0, 0, 0]] * n_terms, dtype=float)
    rows.append(
        {"campus_id": "CID-000001", "population": "current", "major": "Computer Science", "track": "General",
         "entry_type": "First-Time Freshman", "residency": "In-State", "work_hours": work,
         "graduation_year": None, "ttd": None, "cooked": None}
    )
    terms["CID-000001"] = np.array([[load, load, 0, 0, 0]] * 2, dtype=float)
    static = pd.DataFrame(rows).set_index("campus_id")
    return People(static, terms, dict.fromkeys(terms, 0), pd.DataFrame(), pd.DataFrame())
