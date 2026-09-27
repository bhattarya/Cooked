# Team handoff

State as of the merge of #3: models, API, Watchtower and frontend are on `main`, and CI is green. Follow [CONTRIBUTING.md](../CONTRIBUTING.md) for the workflow.

## What works now

- **Models** (`models/manifest.json`): risk per stage (AUC 0.834 at enrollment, 0.925 after one term, on held-out 2023–2026 graduates), time-to-degree quantiles, career destination, first-salary range, autopsy clusters, twin matching with refusal. All six §7.5 gates pass.
- **Model arena** (`models/arena.json`, `ml/arena.py`): four families (baseline, linear, random forest, gradient boosting) compete on every task with the same rows and split, the champion is picked on a validation slice of the training years by a pre-registered rule, and results are reported honestly, including where the fancy model does not win (career destination: the baseline is the champion). Leaderboards, curves, feature importance and plain-English model cards are served by `GET /model-lab/arena`; `POST /model-lab/simulate` adds `drivers` and every family's `candidates`. Read [models/README.md](../models/README.md); types for the web are in `web/lib/arena-types.ts`.
- **API**: every §12 route plus `/narrate`, `/voice`, `/students/{id}/memory` and `/audit/parse`. Every number carries a `tool_result_id`. `DEMO_MODE=1` blocks all outbound calls.
- **Worker**: the Watchtower scores all current students into `app.risk_snapshot` and opens and resolves alarms with hysteresis.
- **Frontend**: a minimal crowd landing page with Google sign-in (guest fallback), and the voice-agent workspace at `/app`: audit upload → seven sponsor-tagged agents → dashboard → spoken and typed follow-ups with visuals. The advisor queue is at `/app/advisor`.
- **Agent API**: `/audit/parse` (Gemini reads real PDFs; samples map to synthetic students), `/students/{id}/ask` (routes to what-if, course plan, stress test, fix, explain), `/say`. Uploaded audits become `USR-` profiles that every tool accepts.
- **Checks**: `make test` (41 tests), `make e2e` (11-step browser walkthrough) and `make check`.

## What's left, and who

| Task | Owner | Notes |
| --- | --- | --- |
| ~~Tiger Cloud: migrate + load~~ | done | PostgreSQL 18.6 / TimescaleDB 2.30.1, all data loaded; see `SETUP_STATUS.md` |
| ~~Gemini, ElevenLabs, Backboard keys~~ | done | All live locally; Gemini free-tier quota is tight (consider billing before judging) |
| Google OAuth client (`docs/accounts.md` step 8) | Dhruv | Redirect URI `/auth/callback/google`; guest sign-in works meanwhile |
| DigitalOcean deploy from `.do/app.yaml` | Dhruv | Spec is complete; fill the encrypted secrets listed in `docs/deployment.md`, deploy, check `https://<app>/api/healthz` on a phone |
| ~~Render and cache the demo audio~~ | done | `make warm`: 25 demo texts voiced and cached in Tiger; re-run after changing templates or voices |
| Rotate every credential after the event | Dhruv | Keys were shared in chat during setup |
| Evidence notebook reproducing §3 numbers | ML | `notebooks/evidence_log.ipynb` is still a placeholder; myths marked "team evidence notebook" depend on it |
| Custom-profile drills | Backend | On the cut list; `/drill` currently needs a `campus_id` |
| Demo script and backup video | Pitch | Suggested order in the build plan §15.1 |

## Notes for whoever touches it next

- Response envelopes are `{mock: false, model_version, data}`. Frontend adapters live in `web/lib/live.ts`.
- About 40% of current students get "not enough evidence" (fewer than 30 balanced twins). That's the refusal rule working. Pick demo students with `/students/{id}/state` where `twins.refused` is false.
- Calibration uses Platt scaling, not isotonic, because isotonic failed the slope gate on about 300 rows. See `ml/risk_model.py`.
- **Retraining** is `make train` (about 70 s), then `touch ml/__init__.py` so `make dev-api` reloads, `make openapi` if `api/` changed, and the full test suite. Commit `models/` (artifact, `arena.json`, manifest, training ids). The arena is deterministic: the same data and seed reproduce `arena.json` byte for byte.
- The shipped risk model is the arena's champion (logistic regression, Platt-calibrated), not the boosted trees the earlier README described. On the current students it correlates 0.97 with the old one and the mean risk is the same; the Watchtower opens 187 alarms at 0.35 where the boosted model opened 179. Golden drills are unchanged.
- The career model that shipped before the arena was worse than always predicting the class frequencies; the champion is now the frequency baseline, so the career odds in the lab do not move with the sliders while `candidates.career` still shows what each family would say. Say so in the UI rather than hiding it.
- The lab builds scenarios the way the data works: credits are only lost to withdrawn or failed courses, and a lost course is retaken the next term (an earlier version fed the models a 90% completion ratio with no withdrawals, which never occurs and produced a 68% default risk).
- Model cards and `champion.note` are generated from the results by code, not by an LLM; they contain no invented numbers.

## Verification (mltruth, round 3: audit-truth audit)

The upload path (`AuditProfile` -> `api/profiles.py term_rows/register/create` -> `ml.snapshots.stage_features`
-> models) had never been checked against the batch dataset path (`db/03_features.sql feat.person_term` ->
`ml/snapshots.py`). It is now: `tests/test_audit_truth.py` carries an independent pure-Python reference
(`ref_rows`/`ref_features`/`ref_history`, no shared code with `api/profiles.py` or `ml/snapshots.py`) plus a
50-alumni round trip (real transcripts, terms shuffled and pushed through `profiles.create`/`register`) that
asserts the uploaded-audit path's term rows, features, risk, time-to-degree and twin set are IDENTICAL to the
batch path for the same person (feature tolerance 1e-9, everything else exact), and a 40-current-student round
trip that additionally exercises in-progress courses.

### Bugs found and fixed in `api/profiles.py::term_rows`
1. **Repeats were computed on Summer/Winter courses too, but those terms were then dropped** — a course only
   ever taken in a dropped season was still marked `repeat` if it reappeared in a regular term, which matches
   `feat.person_term` (repeats there are TOTAL, across all seasons) — this part was already correct. The real
   bugs were:
2. **Grade parsing didn't normalize `B+`/`C-` etc.** — `c.grade.upper()` never equals `"W"`/`"F"`, so a `B+`
   fell into neither branch and was silently counted as earned (correct by luck) but a school's own `WF`/`NC`/
   `FN` grades were never recognized as fails at all, undercounting `f_sum` for anyone whose registrar uses
   them. Fixed with `clean_grade()` (strips `+`/`-`/whitespace) and widened `WITHDRAW`/`FAIL` sets to match
   common audit vocab (`WD`,`WX`,`WF`,`U`,`NC`,`FN`).
3. **In-progress / ungraded courses leaked into behaviour features.** The old code only special-cased courses
   the caller had already routed to `AuditProfile.in_progress`; a term whose courses simply had `grade=""` or
   `"IP"` inline (the common case for a mid-degree upload) had those courses counted as `earned` (0 credits,
   wrong) or worse, counted toward `att`/`earned_ratio`. Before: an in-progress 15-credit term inflated
   `earned_ratio` to 1.0 and `att_mean` upward, silently lowering predicted risk. After: `PENDING` grades are
   excluded from every sum, and a term with **no graded courses at all** is not emitted as a row (matches
   `feat.person_term`, which only has completed terms).
4. **Term ordering used a `^(Spring|Fall)\s+(\d{4})$` anchor** — any audit line like `"Fall 2023 (in progress)"`
   or `"2023 Fall"` failed the match and fell back to file order, silently scrambling `att_last`/`k` for anyone
   whose PDF extraction added trailing text. Replaced with a tolerant `SEASON` regex that accepts both word
   orders and extra text, matching year+season, and orders Winter<Spring<Summer<Fall within a year like the
   registrar calendar.
5. **Transfer/AP credit blocks were never excluded** — a term literally labelled "Transfer Credit" or
   "Advanced Placement" was treated as a real term with its own W/F/repeat counts (there are none, but it
   still shifted `k` and polluted `att_mean`/`att_last`/ordering). Added `NOT_A_TERM` exclusion, consistent
   with the dataset (`db/README` says transfer credit never appears in `feat.transcripts`).
6. **Gaps were hardcoded to 0** for every uploaded profile (`people.gaps[pid] = 0`), so `assign_pattern` (the
   autopsy k-means cluster used for `pattern`) could never place an uploaded student in the "stop-out" cluster
   even when their own terms showed a real gap, and `history_features`'s `has_gap` flag was always false. Fixed:
   `term_rows` now returns a real `gaps` count (from the term_idx span, same definition
   `db/03_features.sql`/`ml/twins.py` use), and `register()` stores it.
7. **Twin matching scored the student on `stage_features(s, terms, k)` with the RAW `k`**, but the alumni twin
   table (`ml/twins.py TwinIndex.table`) is built at `k = min(requested_k, K_MATCH_MAX=8)`. A senior with 10
   completed terms was compared against alumni-at-stage-10 features while the twin pool itself only has
   alumni-at-stage-8 rows for `k>8` requests, silently changing which twins matched (their pool build clips k,
   the query features didn't) whenever `k > K_MATCH_MAX`. Fixed by adding `TwinIndex.features()` (clips to the
   same `K_MATCH_MAX`) and using it at both call sites (`api/engine.py state/repair`, `ml/repair.py` fallback).
8. **`credits_earned` default summed only the model's regular-term rows** (`terms[:, 1].sum()`), which for a
   degree audit undercounts real credits earned by exactly the Summer/Winter credits (those never enter the
   behaviour rows by design, but the DEGREE still counts them). Added `credits_earned_total()`, used only for
   the "how many credits toward the degree" totals shown in the receipt/summary, never for model features.
9. Widened `AuditProfile.terms`/`completed_courses`/`AuditTerm.courses` max lengths (16→32 terms, 12→16 courses
   per term, 80→250 completed courses): real multi-year audits with Summer terms routinely exceed the old caps,
   which would have silently rejected valid uploads (`can_enter_manually` fallback aside, this is exactly the
   "upload error" the user reported — a real 8-year part-time record has ~18 dated terms).

None of these bugs affect the frozen `models/*.joblib` artifacts or their manifest/checksums — only how a live
upload is turned into the same feature vector the models were trained on. No retraining was needed or done.

### Claim ledger

| Screen number | Computed by | Independently re-derived? | Status |
|---|---|---|---|
| Risk % | `Models.risk` (Platt-calibrated GBM/linear per stage `k`) on `stage_features` | Yes — reference features match to 1e-9; risk verified equal to batch path for 50 alumni + 40 current students at every `k` | OK (fixed: pending-course leak, twin-k mismatch upstream of this) |
| Verdict thresholds (`OPEN_AT`=.35, `CLOSE_BELOW`=.25, `THRESHOLD`=.5) | `ml/watchtower.py`, `ml/model_interface.py` | Read from source, exercised via `test_alarm_hysteresis.py` | OK, unchanged this round |
| Trajectory pattern | `assign_pattern` (autopsy k-means on `history_features`) | Verified `history_features` reference matches; verified pattern equal to batch path once `gaps` was fixed (bug 6) | Fixed |
| Twin count `n`, ids, SMD | `TwinIndex.find` | Verified twin set identical to batch path for the same person at the same `k` (bug 7 was silently changing this above `K_MATCH_MAX`) | Fixed |
| "twins who got cooked %" (`twin_cooked_share`) | mean of `cooked` over twin ids in `api/engine.py state()` | `cooked` is alumni-only (`static.cooked` is null for `current`); confirmed the twin id list itself excludes the querying student and is alumni-only (`test_twin_gate_and_definitions`) | OK |
| First-destination distribution of twins (`still_seeking_risk`, `degree_burden`) | Wilson interval / quantiles over `alumni_out.loc[tw.ids]`, `No Response` filtered out first | Confirmed filter runs before the ratio (`reported = outs[outs.first_destination != "No Response"]`) | OK, consistent with non-negotiable |
| Time-to-degree low/mid/high | `Models.ttd` quantile regressors, forced monotone | Verified equal to batch path; "delay" tile = ttd − 4, clearly a different definition (delay past the 4-year mark, not total time) — no naming collision found between screens | OK |
| Fire-drill shocks-to-cooked, rows stored | `ml/fire_drill.py run_drill/monte_carlo`, written via COPY | Logic unchanged this round (out of scope: no bug found reading it, not independently re-derived numerically — see Not Verified) | Not independently re-derived |
| Repair "years sooner"/risk before→after | `ml/repair.py run_repair`/`_lever`, bootstrap CI must exclude 0 | Definitions read; twin-pool bug (7) also fed this via `index.find` fallback — fixed | Fixed (indirectly) |
| Feasibility picks | `ml/repair.py feasibility` over `feat.course_catalog` | Logic read, not independently re-derived (catalog-string parsing, no numeric claim) | Not independently re-derived |
| Watchtower alarm decisions | `hysteresis()` pure function of risk vs `OPEN_AT`/`CLOSE_BELOW` | Read, deterministic, covered by `test_alarm_hysteresis.py` | OK |

### New endpoints
- `GET /profiles/{id}/receipt` — terms (with `counted`/`note` explaining Summer/Winter/in-progress exclusion),
  totals (`credits_in_progress` now correctly computed, dedup'd across `in_progress` and inline pending
  courses), and every model feature with a label/unit/note, all tied to one `tool_result_id`. ~250-400ms warm
  (one DB round trip over the network to Tiger Cloud to reload the audit/transcript; no local caching added
  because a receipt must reflect the live profile, not a stale cache).
- `POST /model-lab/from-student` — derives the lab scenario server-side from the real profile
  (`model_lab.scenario_from_student`), applies `overrides` on top, and returns `/model-lab/simulate`'s shape
  plus `derived_from` and `baseline` (the same profile's own unmodified prediction, unaffected by overrides).
  Warm latency ~2-3ms (reuses `model_lab`'s existing per-engine `_context`/LRU cache), well under 250ms.

### Not verified
- Gemini-parsed real PDFs end-to-end (net calls are blocked in tests per BRIEF3; `api/audit_parse.py`'s
  deterministic parser is owned by the "audit" agent, not reviewed here beyond its `AuditProfile` output shape).
- `ml/fire_drill.py` and `ml/repair.py::feasibility` numerically re-derived against an independent reference
  (read and reasoned about, not reference-implemented — out of the 50-alumni round trip's scope, which covers
  `term_rows`/`stage_features`/`risk`/`ttd`/`pattern`/twins).
- Frontend consumption of the new endpoints (out of file ownership).
