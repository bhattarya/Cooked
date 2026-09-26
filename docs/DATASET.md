# Dataset provenance

COOKED runs entirely on the official **HackUMBC 2026 Career Pathways & Degree ROI dataset** published by UMBC DoIT:

- Repository: <https://github.com/jasonpaluck/hackumbc-2026>
- Pinned commit: [`41398972ce9ce8c6756159207b00386a75ed5be5`](https://github.com/jasonpaluck/hackumbc-2026/tree/41398972ce9ce8c6756159207b00386a75ed5be5), which was still the upstream HEAD when we last checked
- License: CC0 1.0. The data is **synthetic**: it comes from a simulation, and no record describes a real UMBC student, employer, course or outcome.

No other student data is used to train or evaluate anything. The only other input is a degree audit that a user chooses to upload at runtime. That audit is parsed in memory, compared against the dataset, and never stored as a file.

## Verify it yourself

You need only Python and network access. No database or keys are required.

```sh
make verify-data        # or: python -m scripts.verify_dataset
```

The command downloads all six CSVs from the pinned commit and checks each file's SHA-256, header and row count against [`db/dataset.json`](../db/dataset.json). It also confirms that the local copy the app loaded is byte-identical, and reports whether upstream has moved past the pinned commit. `make load` runs the same checks before it loads anything, so the app cannot start on modified data.

| File | Rows | SHA-256 |
|---|---:|---|
| `alumni.csv` | 3,200 | `35e4ce483c04c64cad3a21c9cd406b2902c130852e2484ca26165a6827e9cc53` |
| `students_current.csv` | 1,800 | `e7b5366d2637c176c8fb65bd6d5b215cfb979323cbe6ee99be244eeef898442f` |
| `transcripts.csv` | 140,458 | `972e3eb851aa122230db2e136b860dbac814787e89e74e934dab7896c6d9eb3e` |
| `employment_history.csv` | 6,028 | `66ab3f1fde5dd7b115480241ca433f0c1b99cd71479a0fb955a4259f862950a4` |
| `student_experience.csv` | 20,059 | `7b0db6ced145c03b50ffb921b1c8869532c09fec47900dc9eaa823535d28f892` |
| `course_catalog.csv` | 72 | `cedf4b79b17681bc9fc867222b9bb4058185039365ff18fe1887f59a45bd5339` |

The raw CSVs are not committed. `make load` downloads them from the pinned commit into `data/raw/`, which is gitignored.

## Where each file is used

Each CSV is loaded as-is into a `raw.*` table ([`db/01_raw.sql`](../db/01_raw.sql), [`scripts/load.py`](../scripts/load.py)). A typed `feat.*` view ([`db/03_features.sql`](../db/03_features.sql)) then turns `Not Applicable` into NULL and casts the types. Everything downstream reads those views.

| File | Used for |
|---|---|
| `alumni.csv` | Outcome labels for training: time to degree, the "cooked" flag, and first destination. Also salary and net cost for degree burden, and the twin pool ([`ml/snapshots.py`](../ml/snapshots.py), [`api/engine.py`](../api/engine.py)). |
| `transcripts.csv` | Per-term features for the stage-aligned snapshots (load, GPA, withdrawals, repeats), the risk and time-to-degree models, the autopsy clusters, and the course-status checks in repair ([`ml/snapshots.py`](../ml/snapshots.py), [`ml/repair.py`](../ml/repair.py)). |
| `students_current.csv` | The 1,800 current students scored by Watchtower and shown in the advisor queue. `credits_earned` includes transfer credit ([`ml/watchtower.py`](../ml/watchtower.py)). |
| `course_catalog.csv` | Prerequisites and the terms each course is offered, used to check that a repair plan or a "course X instead of Y" swap is actually feasible ([`ml/repair.py`](../ml/repair.py)). |
| `student_experience.csv` | Internship and co-op outcomes, which set the shock rates used by the fire drill ([`ml/shocks.py`](../ml/shocks.py), [`ml/fire_drill.py`](../ml/fire_drill.py)). |
| `employment_history.csv` | Loaded, typed and integrity-checked ([`scripts/check_integrity.py`](../scripts/check_integrity.py)). The current models take first-destination outcomes from `alumni.csv` instead. |

Model metrics, including the temporal split (train on 2021 and earlier, calibrate on 2022, test on 2023–26), are in [`models/`](../models) and the README.

## Rules from the dataset README that we follow

- `Not Applicable` is a literal string, so it becomes NULL only in the typed views.
- `W` and `IP` grades do not count as completed terms. Summer terms are left out of the per-term features.
- Transfer credits appear in `students_current.credits_earned` but not in `transcripts.csv`.
- `No Response` means the outcome is unknown, not that the student is unemployed. It is excluded from still-seeking rates, and the UI says so.
- Dollar amounts are nominal for their year, and no cross-year dollar comparisons are made.
- The dataset has no race, gender or ethnicity fields, and COOKED builds no proxies for them.
- The UI states that the data is synthetic on the landing page and on every dashboard.
