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
