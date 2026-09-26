# Team handoff

State as of the merge of #3: models, API, Watchtower and frontend are on `main`, and CI is green. Follow [CONTRIBUTING.md](../CONTRIBUTING.md) for the workflow.

## What works now

- **Models** (`models/manifest.json`): risk per stage (AUC 0.834 at enrollment, 0.940 after one term, on held-out 2023–2026 graduates), time-to-degree quantiles, autopsy clusters, twin matching with refusal. All six §7.5 gates pass.
- **API**: every §12 route plus `/narrate`, `/voice`, `/students/{id}/memory` and `/audit/parse`. Every number carries a `tool_result_id`. `DEMO_MODE=1` blocks all outbound calls.
- **Worker**: the Watchtower scores all current students into `app.risk_snapshot` and opens and resolves alarms with hysteresis.
- **Frontend**: landing, cockpit (alarm → drill → repair), queue and myths. It uses the API when `/healthz` reports `mode: "models"` and falls back to the browser engine otherwise.
- **Checks**: `make test` (41 tests), `make e2e` (11-step browser walkthrough) and `make check`.

## What's left, and who

| Task | Owner | Notes |
| --- | --- | --- |
| Tiger Cloud service; URLs in `.env` and DigitalOcean; `make migrate load` against it | Dhruv | Record the version and limits in `SETUP_STATUS.md` |
| Gemini, ElevenLabs and Backboard keys; run `scripts/smoke_*` | Dhruv | Until then: templates, browser voice, local memory |
| DigitalOcean deploy from `.do/app.yaml`; verify on a phone | Dhruv | Set `DO_DEPLOY_ENABLED=true` when ready |
| Render and cache the demo narration audio once keys exist | Backend | Hit `/narrate` then `/voice` for the three demo students so the demo replays offline |
| Evidence notebook reproducing §3 numbers | ML | `notebooks/evidence_log.ipynb` is still a placeholder; myths marked "team evidence notebook" depend on it |
| Custom-profile drills | Backend | On the cut list; `/drill` currently needs a `campus_id` |
| Demo script and backup video | Pitch | Suggested order in the build plan §15.1 |

## Notes for whoever touches it next

- Response envelopes are `{mock: false, model_version, data}`. Frontend adapters live in `web/lib/live.ts`.
- About 40% of current students get "not enough evidence" (fewer than 30 balanced twins). That's the refusal rule working. Pick demo students with `/students/{id}/state` where `twins.refused` is false.
- Calibration uses Platt scaling, not isotonic, because isotonic failed the slope gate on about 300 rows. See `ml/risk_model.py`.
