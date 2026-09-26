# Teammate handoff

Share this draft in the group chat before replacing mock contracts. No chat message has been sent by the coding assistant. Keep table names and route paths from the PDF; proposed changes belong in the PR and group discussion first.

## Backend / ML / agents teammate

- Replace `api/routes/mock.py` route bodies only after reviewing `api/schemas.py` and `docs/openapi.json`. Current envelopes are `{mock: true, message, data}`; nulls/empty arrays are deliberate, not computed zero values. Feedback is not saved; no drill IDs are fabricated. Numeric outputs use evidence objects carrying `tool_result_id`.
- Resolve the PDF's JSON-only convention versus `/audio/{hash}` returning `audio/mpeg`. Phase 1 returns a marked JSON placeholder. Add the binary response and agreed error behavior together with frontend changes.
- Custom-profile input is a minimal draft (work hours, credits/term, entry type, residency), not the full prediction state. Extend after group agreement. Feedback text is capped at 120 characters, extra fields rejected; this does not constitute detection of real personal data.
- No endpoints call providers or execute product queries. `GET /healthz` alone checks DB/cache-table access through `app_rw`. It reports model checksum `not_configured`; implement startup enforcement and replace the skipped checksum test when frozen artifacts exist.
- Implement snapshots, leakage quarantine, temporal split, alumni-only training, cluster modes, risk/twins/shocks, repair feasibility, hysteresis, provenance and actual cache replay in the reserved modules. `DEMO_MODE=1` explicitly rejects product routes until replay exists.
- Use `feat` typed views and `feat.person_term`; current labels stay NULL. `mode` is always NULL until you assign it. Loader reruns reset derived features/modes; coordinate loads. Existing app event/cache tables survive.
- `owner` owns schema/migrations, `app_rw` reads features and writes application data, `agent_ro` only reads explicitly granted `v` views. Do not expose raw SQL strings from clients. New agent views need an explicit grant and permission tests.
- `app.drill_run`, a general LLM response cache, and memory fallback storage have no complete schema in §6.3. Agree their migrations rather than inferring data contracts. Feedback references alarm IDs without a hypertable FK as directed by the PDF; backend must enforce existence.
- Worker is a no-op. Replace its body when Watchtower is ready. Add only the provider secrets the worker actually needs in DigitalOcean.
- Replace all eight skipped `handoff` tests with real assertions. DB/infrastructure tests already execute real behavior. Notebook is empty and makes no reproduction claim.

## Frontend teammate and Dhruv

- Run the README commands and use `NEXT_PUBLIC_API_URL` as the API base. Do not place secrets in any `NEXT_PUBLIC_` variable.
- Use the checked-in OpenAPI file while backend is developing. Do not display mock nulls as risk values or interpret empty queues as a measured absence of alarms.
- `/healthz` HTTP 200 in `mode=scaffold` means the DB and voice-cache table are reachable; it does not mean models are ready.
- Preserve synthetic-data disclosure; add “Voice by ElevenLabs” before enabling audio. No real student inputs.
- Keep the app minimal until backend contract review. The existing page demonstrates a browser request, loading/error states, and retry.
- Regenerate `make openapi` for agreed schema changes. CI checks the generated file.

## Dhruv infrastructure tasks still requiring accounts

Create/configure Tiger and DigitalOcean; record actual versions/limits, run smoke tests with real keys, protect `main`, set CI deploy secrets/variables, and open deployed HTTPS URLs from a phone on cellular data. Record evidence in `SETUP_STATUS.md`. Never record credentials there.
