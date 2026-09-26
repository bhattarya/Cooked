# COOKED setup status

## Phase 2 (models, API, worker, frontend): merged to `main` (#2, #3), CI green

New teammates: `make bootstrap && make dev` (see README and CONTRIBUTING.md). Remaining owner tasks are in `docs/handoff.md`.

- `make train`: all six §7.5 gates pass; held-out AUC 0.834 (enrollment only) / 0.940 (one term); artifacts frozen with SHA-256 manifest.
- `pytest`: **40 passed, 0 skipped** against local TimescaleDB 2.18.2 (the eight handoff skips are now real tests, plus golden drills).
- API Docker image (`api/Dockerfile`, Python 3.12) builds, verifies the artifact checksum and serves the same predictions as local.
- Watchtower: two passes scored 1,386 students; the second opened no duplicate alarms (hysteresis).
- Frontend production build passes; live mode verified in the browser against the local API.
- **Not verified:** Gemini, ElevenLabs and Backboard live calls (no keys yet; clients fall back to template / browser voice / `app.memory_note`), Tiger Cloud and DigitalOcean deployment.

## Live services (verified 2026-09-26, local API against the real providers)

| Service | Status | Evidence / notes |
| --- | --- | --- |
| Tiger Cloud | ✅ live | PostgreSQL 18.6, TimescaleDB 2.30.1. Migrations 00–08 applied; dataset loaded, all integrity checks PASS; `pytest` 54 passed against it; `smoke_tiger` PASS; Watchtower scored 1,386 students (179 alarms). `scripts/migrate.py` now gives role `owner` LOGIN **without a password** when it is NOLOGIN: TimescaleDB requires the hypertable owner to have LOGIN to run columnstore / continuous-aggregate jobs, and with no password nobody can sign in as it (verified). |
| Gemini | ✅ live, quota-limited | `gemini-3-flash` is not available to this key; using `gemini-3.8-flash` (routing + structured audit parsing verified; `smoke_gemini` PASS). Free-tier 429s are frequent: calls back off (bounded), question routing fails fast to the local router, and narration answers with the traced template while Gemini writes in the background and caches in `app.llm_cache`. Real audit PDF → profile verified. |
| Backboard | ✅ writes, ⚠️ recall | Memory writes succeed from the app. `smoke_backboard` created/deleted its assistant but cross-thread recall did not appear within its 3 retries (memory extraction is asynchronous). `app.memory_note` is always written first. |
| ElevenLabs | ❌ key restricted | Every endpoint, including text-to-speech, returns `missing_permissions`. In ElevenLabs → API keys, enable **Text to Speech** (and Voices/Models/User read for the smoke test) or create an unrestricted key. `ELEVENLABS_MODEL` was a voice id; set to `eleven_flash_v2_5`. Until then the browser voice is used and the UI says so. |
| Google sign-in | ⏳ not configured | See `docs/accounts.md` step 8; guest sign-in works meanwhile. |
| DigitalOcean | ⏳ not deployed | `.do/app.yaml` ready; needs the secrets above as encrypted env vars plus `AUTH_URL`. |

**Rotate every credential after the event**: they were shared in chat while setting up.

# COOKED Phase 1 setup status

Updated: 2026-09-26. Rules gate: Dhruv authorized proceeding after the pre-event rules question. The assistant has not independently verified organizer rules.

**Local foundation is implemented and tested. Cloud deployment is not yet verified.** No provider accounts were created, no provider keys were supplied, and no real student data was used.

## Done

- Requested repo layout, Makefile targets, Python dependency constraints, Next.js lockfile, ignored raw downloads and environment files.
- Seven ordered, checksummed SQL migrations using PDF table names, typed source views, four hypertables, columnstore policy, continuous aggregate, owner/app/agent privileges.
- All six pinned CSVs loaded locally: **3,200 / 1,800 / 140,458 / 6,028 / 20,059 / 72**. Exact source hashes and columns recorded in `db/dataset.json`.
- Atomic loader; NULL handling before casts; disjoint populations; completed Fall/Spring features with no IP coursework; current labels remain NULL. Alumni labels are deterministic SQL, and cluster modes remain unimplemented.
- FastAPI health checks real DB/cache-table access; model checksum explicitly `not_configured`. All §12 product routes return marked mocks. Draft typed schemas and generated `docs/openapi.json` are ready for teammate review.
- Next.js placeholder page calls `/healthz`, handles loading/errors, and retries. No-op worker is ready for deployment wiring.
- DigitalOcean three-component app spec for `bhattarya/Cooked` main, encrypted runtime secret slots, and CI-trigger configuration.
- GitHub Actions definition for TimescaleDB/API tests, web build, secret scanning, OpenAPI drift/export, and gated deployment.
- Account checklist, provider smoke scripts, database compatibility notes, setup/deployment instructions, and [exact handoff notes](docs/handoff.md).
- Pre-commit gitleaks hook installed locally. `.env` was ignored before the first foundation commit.

## Verification evidence

| Check | Result |
| --- | --- |
| Local database | TimescaleDB **2.18.2**, PostgreSQL 17 image, Colima, port 55432 |
| Migrations | All `00`–`06` applied; repeat run skipped all seven and safely reconfigured login credentials |
| Loader and integrity | All raw counts, population separation, label rules, employment end dates, completed feature terms and join integrity passed |
| Test suite | **12 passed, 8 skipped**; all 8 skips are explicit backend/ML TODOs |
| Agent role | Can query allowlisted views; cannot read raw/feat/app, execute feature refresh, assume owner/app role, create tables or write |
| Feature calculation | Test independently reconstructs all person-term features from raw transcript rows |
| Tiger smoke (local) | 10,000 rows inserted; continuous aggregate refreshed to total 10,000; temporary schema removed |
| API/web | API dependency test passed; Next.js production build passed |
| E2E (local Chrome) | Successful browser → API → DB/cache-table request: **0.517 seconds**; initial dev-browser attempts exceeded the target, so this is a single successful rerun, not a latency guarantee |
| Lint/OpenAPI | Ruff passed; generated OpenAPI matched checked-in export |
| Provider live smoke tests | Not run: real keys/model/voice IDs unavailable |
| GitHub-hosted CI | Pending branch push/PR workflow |
| DigitalOcean HTTPS/phone | Not run: no deployed app URL |

The test client currently emits a Starlette warning about its httpx compatibility path. Tests pass; no additional HTTP framework was introduced to suppress it.

## Blocked / account-dependent

- **Tiger Cloud:** Dhruv must create the service, supply URLs locally, and record installed PostgreSQL/Timescale versions, storage/connections and expiry. Then run migration/load/test/smoke commands on that service.
- **Provider calls:** Gemini model/key, Backboard key, ElevenLabs model/key/voice IDs must be configured. ElevenLabs needs manual listening and plan attribution review. Backboard requires observed recall across threads.
- **DigitalOcean:** Create/connect project/app, fill encrypted secrets, inspect billing/MLH credits and run the first deployment from tested main. Record API/web URLs and verify both from a phone on cellular data.
- **GitHub:** Remote CI, PR URL and branch protection are not confirmed here yet. Require `Database and API`, `Web build`, `Secret scan`. Automated DO deployment stays disabled until the app/token/variables are ready.
- **Team contract review:** Share `docs/handoff.md` and OpenAPI in the group chat. Response shapes are draft mocks, not an agreed production contract. No group-chat message was sent by the assistant.

## Not verified

- Organizer rules, event deadlines/length, team registration and multi-sponsor prize eligibility (user authorized coding; independent organizer confirmation is not recorded).
- Actual Tiger version/privilege restrictions and limits. Columnstore SQL is tested locally; compatibility must be confirmed on the actual cloud service. [Documented adaptation](docs/database.md).
- Gemini model availability and actual RPM/TPM/RPD for the team's project. Use AI Studio's active limits, not the PDF's approximate rate.
- Backboard credit balance/expiry and non-default model routing requirements. Docs currently describe $5/30-day signup credit, but this team's account has not been inspected.
- ElevenLabs voice eligibility, actual credit rate/attribution terms and subscription permissions. Script reports an observed counter delta; concurrent usage can distort it.
- DigitalOcean credit application/card requirements, final component prices and spec acceptance against a live app.
- Real cached clip replay, startup artifact checksum enforcement, ML validation, provenance and alarm behavior. These are intentionally backend work; green Phase 1 tests do not prove them.
- All research claims in the PDF, including CPI, calibration, clusters, and shock probabilities. The evidence notebook is an unexecuted placeholder.

## URLs and safe configuration record

| Item | Value |
| --- | --- |
| Repository | https://github.com/bhattarya/Cooked |
| Branch | `feat/phase1-foundation` |
| PR | Pending |
| Local API | http://localhost:8000/healthz |
| Local web | http://localhost:3000 |
| Local Swagger | http://localhost:8000/docs |
| OpenAPI | `docs/openapi.json`; runtime `/openapi.json`; CI artifact `openapi` |
| Deployed web | Not created/verified |
| Deployed API | Not created/verified; planned `<web URL>/api` |
| Tiger service/region/version/limits | Pending Dhruv |

Local verification uses `.env.local-test` with generated local-only credentials (ignored; mode 0600). Your provider `.env` has not been created or overwritten. To reuse the verification DB, run `COOKED_ENV_FILE=.env.local-test make migrate load test`. It uses port 55432; start with `docker-compose --env-file .env.local-test up -d --wait db`. Run Colima from your own terminal to keep it available independently of this assistant session.

## Exact handoff

**Backend teammate:** start with `docs/handoff.md`, `api/schemas.py`, `db/03_features.sql`, and the eight skipped tests. Implement ML/agents/product endpoint logic and checksum/replay enforcement. Agree missing `drill_run` and general cache schemas first. Do not rerun the loader after assigning modes without coordinating, because derived features/modes are refreshed.

**Frontend teammate + Dhruv:** start with `web/app/page.js` and `docs/openapi.json`. Configure the public API base, keep mock/null outputs visibly distinct, preserve synthetic-data disclosure, and agree audio content types before wiring playback.

**Dhruv infrastructure:** finish `docs/accounts.md` and `docs/deployment.md`, record actual provider limits and HTTPS URLs, run smoke scripts with configured keys, verify on a phone, and update this status. Never put secrets or DB connection strings in this file.
