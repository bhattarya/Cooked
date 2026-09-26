# Team handoff

State as of the merge of #3: models, API, Watchtower and frontend are on `main`, and CI is green. Follow [CONTRIBUTING.md](../CONTRIBUTING.md) for the workflow.

## What works now

- **Models** (`models/manifest.json`): risk per stage (AUC 0.834 at enrollment, 0.940 after one term, on held-out 2023–2026 graduates), time-to-degree quantiles, autopsy clusters, twin matching with refusal. All six §7.5 gates pass.
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
