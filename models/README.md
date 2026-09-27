# Frozen models

Everything here is produced by `make train` (about 70 seconds, `python -m ml.train`) and checked in. The API refuses to start if any file differs from the SHA-256 recorded in `manifest.json`, so never edit these by hand. Never load joblib files you did not train.

| File | What |
| --- | --- |
| `cooked-v1.joblib` | The shipped champion of each task, plus every competing model (for the side-by-side view), the autopsy clusters and shock rates |
| `arena.json` | The model arena report: leaderboards, curves, feature importance and model cards. Served by `GET /model-lab/arena` |
| `manifest.json` | Version, checksums of the three files above, gate results, per-stage metrics of the shipped models, champion per task |
| `training_ids.json` | Every alumnus used to fit; `make test` checks it never contains a current student |

## The model arena

COOKED has four prediction tasks. For each one, four model families compete on the same rows, the same temporal split and the same features, and the champion ships.

| Task | Predicts | Shipped champion |
| --- | --- | --- |
| Academic risk (stages 0 to 6 completed terms) | P(cooked): more than 5 years to degree, or 5+ withdrawals | Logistic regression + Platt calibration |
| Time to degree (stages 0 to 6) | p25 / p50 / p75 years to degree | Gradient boosting (quantile loss) |
| Career destination | Employed / Continuing education / Still seeking | Naive baseline (class frequencies) |
| First-job salary | p25 / p50 / p75 nominal dollars, employed alumni only | Linear quantile regression |

Families, simplest to most complex: **baseline** (what you would say without a model), **linear** (logistic regression, or one linear quantile regression per quantile), **random forest** (quantiles from out-of-bag residuals) and **gradient boosting** (the model COOKED shipped before the arena). Definitions and fixed hyper-parameters are in `ml/candidates.py`; the protocol is in `ml/arena.py`.

### How the champion is chosen (pre-registered, written into `arena.json`)

1. Each family is fitted on the years before the validation year and scored on the validation year, a slice of the **training** years (risk and time to degree: fit 2015 to 2020, validate 2021; career and salary: fit 2015 to 2021, validate 2022).
2. The champion is the **simplest family within 1% (relative) of the best validation score**. Metrics: mean AUROC over stages (risk), mean pinball loss (time to degree, salary), log loss (career). The rule takes validation scores and nothing else (`ml/arena_metrics.choose_champion`), and `tests/test_model_arena.py` checks the stored scores reproduce the stored champion.
3. Every family is then refitted on all training years (risk and time to degree: 2015 to 2021, Platt calibration on 2022 for risk; career and salary: 2015 to 2022) and scored **once** on the graduating classes of 2023 to 2026. Holdout differences carry paired bootstrap intervals; a model "beats" another only if the 95% interval of its improvement excludes zero.

Graduation year is a split key, never a feature. No current student is in any training set. No Response (480 alumni) is unknown, not an outcome, and Military (31) is too small for a class; both are excluded from the career task and counted in the model card.

### Holdout leaderboard (2023 to 2026 graduates)

Risk, enrollment only (stage 0; later stages partly read the label, see below):

| Family | AUROC | AUPRC | Brier | Log loss |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 0.500 | 0.155 | 0.133 | 0.438 |
| **Linear (champion)** | 0.834 | 0.572 | 0.095 | 0.321 |
| Random forest | 0.827 | 0.545 | 0.097 | 0.329 |
| Gradient boosting | 0.834 | 0.546 | 0.097 | 0.324 |

Time to degree, after one term (years):

| Family | MAE of median | Pinball | p25-p75 coverage |
| --- | ---: | ---: | ---: |
| Baseline | 1.021 | 0.465 | 0.548 |
| Linear | 0.533 | 0.231 | 0.519 |
| Random forest | 0.466 | 0.205 | 0.506 |
| **Gradient boosting (champion)** | 0.468 | 0.204 | 0.478 |

Career destination:

| Family | Macro F1 | Accuracy | Top-2 accuracy | Log loss |
| --- | ---: | ---: | ---: | ---: |
| **Baseline (champion)** | 0.292 | 0.780 | 0.880 | 0.688 |
| Linear | 0.292 | 0.780 | 0.910 | 0.683 |
| Random forest | 0.292 | 0.780 | 0.911 | 0.684 |
| Gradient boosting | 0.292 | 0.779 | 0.906 | 0.741 |

First-job salary (dollars):

| Family | MAE | R-squared | p25-p75 coverage |
| --- | ---: | ---: | ---: |
| Baseline (median) | 14,840 | -0.295 | 0.450 |
| **Linear (champion)** | 13,614 | -0.094 | 0.411 |
| Random forest | 13,861 | -0.126 | 0.413 |
| Gradient boosting | 13,919 | -0.138 | 0.351 |

`arena.json` is the source of truth; these tables are a snapshot of the frozen artifact.

### Honesty notes (also in each task's `champion.note` and `card.limitations`)

- **Career destination is not predictable from these inputs.** No learned model beats the class-frequency baseline on validation or on the holdout; every model predicts "Employed" for essentially everyone (macro F1 is identical to always guessing it). The gradient boosting model that shipped before the arena had a *worse* log loss than the baseline (0.741 against 0.688, interval excludes zero), meaning its probabilities were overconfident. The baseline is the champion and ships; the lab still shows what each family would say.
- **Salary is only weakly predictable.** Linear quantile regression beats the median baseline (MAE 13,614 against 14,840) but R-squared is negative. Salaries are nominal dollars that rose from a 2015 median of 71,000 to 83,750 for 2022, and graduation year is deliberately not a feature, so holdout predictions are too low by about 8,900 on average. No cross-year dollar comparison is meant.
- **Risk after the first term partly reads the label.** The cooked flag counts withdrawals, so stages 1 and up look better than the model really is. The arena headlines stage 0. The linear model is the champion because it is within noise of boosting on validation; on the holdout boosting is numerically ahead at stage 1 (AUROC 0.940 against 0.925) and the linear model is ahead at stages 4 to 6.
- **Time to degree is the one task where extra complexity earns its place**: boosting and the forest beat the linear model beyond noise.
- The boosting hyper-parameters predate the arena and their tuning history is not recorded. The linear quantile regressors carry a small L1 penalty (alpha 0.001 on a standardised target) because the unpenalised first version paired huge opposite weights on two 97%-correlated features; that was decided from training-set coefficients, not from holdout scores. Nothing is tuned on the holdout.
- Champion selection uses one validation year per task, which is noisy (about 230 alumni at stage 0). That is why the rule prefers the simpler model when scores are close.
- The features are fixed by `ml/snapshots.py` (no GPA); the career and salary models add three end-of-degree counts (internships, credentials, engagement).
- Everything is synthetic (HackUMBC 2026) and associational. Do not use these models for decisions about real students.

### Model cards

Each task has a plain-English card in `arena.json` (`tasks.<task>.card`): what it predicts, what it was trained on (row counts, years), the features in plain English, limitations, and what it should not be used for.

## The shipped models and the lab

`ml/model_interface.py` is the one model boundary. `Models.risk`, `.ttd`, `.career` and `.salary_range` score with the champions; `.risk_by_family`, `.ttd_by_family`, `.career_by_family` and `.salary_by_family` score the same input with every family. `Models` limits OpenMP to one thread, because single-row gradient boosting predictions are about 20 times slower with thread fan-out.

The API serves the arena at `GET /model-lab/arena` (the frozen `arena.json`) and scores scenarios at `POST /model-lab/simulate` (`api/model_lab.py`):

- The scenario becomes per-term records shaped like the training data: credits are only lost to withdrawn or failed courses (3 credits each), a lost course is retaken the next term, and inputs beyond the training range are held at its edge and listed in `out_of_range`. A completion shortfall that withdrawals and failures do not explain counts as further withdrawals (`effective`).
- The trajectory at each stage uses only terms up to that stage. Stages after `completed_terms` are projected with the same load and no new withdrawals (`projected: true`).
- `drivers` re-scores the scenario with one input at a time set to the typical alumnus value (data median or most common category); the shift is real champion output. `candidates` gives every family's answer per task.
- Warm latency is about 40 ms per new scenario (identical repeats are served from a small cache).

TypeScript types for both responses are in `web/lib/arena-types.ts`.

## Retraining

```sh
make train                       # fit, run the arena, freeze models/, print the six gates
touch ml/__init__.py             # lets a running `make dev-api` reload (it watches api/ and ml/)
make openapi                     # only if api/ changed
.venv/bin/python -m pytest -q    # includes the arena tests
```

Everything is seeded (`ml/risk_model.SEED`) and `arena.json` holds no timestamps, so retraining on the same data reproduces it byte for byte (`tests/test_model_arena.py` checks this on synthetic data). Commit `models/`, and `docs/openapi.json` if the API changed. All six gates must print PASS.
