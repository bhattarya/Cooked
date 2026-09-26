# COOKED

Know you are cooked before it is too late — and get un-cooked.

Built for HackUMBC 2026, Career Pathways & Degree ROI. **All data is synthetic, CC0.** No records describe real UMBC students, employers, courses, or outcomes. Do not upload real student data. This is a demo, not academic or financial advice.

The build plan PDF is the design reference. Dhruv owns infrastructure and then frontend; one teammate owns backend/ML/agents, and one owns frontend. The trained models, real API routes, Watchtower worker and frontend are implemented (see [Models, API and frontend](#models-api-and-frontend)). Gemini, ElevenLabs and Backboard calls are wired but only activate once their keys are configured.

## Data

Everything runs on the official [HackUMBC 2026 Career Pathways & Degree ROI dataset](https://github.com/jasonpaluck/hackumbc-2026), pinned to commit `41398972` with SHA-256 checks in `db/dataset.json` (CC0 1.0). **The dataset is synthetic:** it was produced by a simulation for the event, and nothing COOKED shows is a fact about real UMBC students or graduates. The app says so on the landing page and on every dashboard.

How we follow the dataset's rules:
- `Not Applicable` is a literal string; typed `feat` views turn it into NULL before casting.
- `W` and `IP` are excluded from completed terms; Summer terms are excluded from the per-term features by design.
- Transfer credits appear in `students_current.credits_earned` but not in `transcripts.csv`. We use the former for progress, and infer the prerequisites of courses a transfer student is already taking.
- `No Response` (about 15% of alumni) means *unknown*, not unemployed: it is excluded from still-seeking rates, and the UI says so.
- Money is nominal dollars of its year. Degree burden (net cost ÷ first salary) is labelled nominal, and no cross-year dollar comparisons are made.
- There are no race, gender or ethnicity fields, and COOKED builds no proxies for them.

External services (Gemini, ElevenLabs, Backboard) only ever receive synthetic records, or an audit a user chooses to upload; uploaded files are never stored.

## Getting started

You need **Python 3.11+**, **Node.js 22+**, **Git**, and a running **Docker** engine (Docker Desktop, or Colima; use `make ... COMPOSE=docker-compose` if you only have standalone `docker-compose`).

```sh
git clone https://github.com/bhattarya/Cooked.git
cd Cooked
make bootstrap   # venv + deps, .env with generated DB passwords, local TimescaleDB, migrate, load data
make test        # 40+ tests against the real database
make dev         # API http://localhost:8000 (docs at /docs) + web http://localhost:3000
```

`make bootstrap` is safe to re-run. It never overwrites an existing `.env`, and it picks another port if 5432 is taken. The trained models are committed in `models/`, so you don't need to train anything to run the app. Run `make help` for every command, and read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

Provider keys (Gemini, ElevenLabs, Backboard) are optional. Without them narration uses deterministic templates, voice falls back to the browser, and memory is stored in `app.memory_note`. Add keys to your `.env` to switch those on. Never paste credentials into chat, screenshots, issues or commits.

**Tiger Cloud instead of local Docker:** put the service's three URLs in `.env` (`sslmode=require`, all pointing at the same database), skip `make db-up`, and run `make migrate load`.

## Database

`db/00_extensions.sql` through `06_roles_views.sql` are applied in order with a checksum ledger and advisory lock. Reruns skip applied files; editing applied migrations is rejected. Use a dedicated COOKED service/database: role names are cluster-wide, and setup revokes PUBLIC temporary-table and public-schema creation privileges. `DATABASE_URL` is the service administrator/migration connection, acting as the `owner` role for application objects. On Tiger the new `owner` role is NOLOGIN, granted to the existing service administrator; no provider-admin password is copied or changed. Local Docker uses its `owner` bootstrap account. API and worker use only `DATABASE_URL_APP`.

Set `DATABASE_URL_APP` and `DATABASE_URL_AGENT` with your chosen passwords **before** `make migrate`; the migration runner provisions those logins. It sends SCRAM verifiers rather than plaintext passwords to SQL. Existing elevated app roles cause setup to fail. `agent_ro` can select only allowlisted `v` views, defaults to read-only transactions, and has a 3-second statement timeout. System catalogs remain visible as in normal PostgreSQL. `app_rw` reads `feat`/`v`, writes `app`, and cannot access `raw`.

`make load` downloads the six files from the [pinned synthetic dataset](https://github.com/jasonpaluck/hackumbc-2026/tree/41398972ce9ce8c6756159207b00386a75ed5be5). SHA-256, headers and exact row counts are in `db/dataset.json`. Downloads and generated audio live under ignored `data/`. Loading replaces raw data and derived person features atomically; it preserves application events/cache. Run loads before backend begins writing derived labels/modes: refreshing features resets `mode` to NULL.

Raw fields remain TEXT, including literal `Not Applicable`; typed `feat` views apply `NULLIF` before casting. `No Response` remains a distinct category. `feat.person_term` excludes Summer and IP rows. Its dates are January 15/August 25 and `term_idx = 2*year + is_fall`; `k` numbers observed completed regular terms, without inventing skipped terms or transfer credits. The deterministic alumni `cooked` label uses time-to-degree >5 years or at least five **total** withdrawals (including Summer). Current labels/outcomes and all modes stay NULL. Backend owns training/splits/clustering.

Expected raw counts: alumni 3,200; current 1,800; transcripts 140,458; employment 6,028; experience 20,059; catalog 72. `make load` and `scripts.check_integrity` validate these. Tests independently recompute completed regular-term features and exercise actual restricted DB connections.

Local/CI image: TimescaleDB 2.18.2 on PostgreSQL 17. SQL requires TimescaleDB >=2.18 and uses columnstore syntax; the exact Tiger version must still be recorded at service creation. See [database compatibility](docs/database.md) for changes from the PDF.

## API contract

Open [docs/openapi.json](docs/openapi.json), or local [Swagger UI](http://localhost:8000/docs). Every §12 route is implemented over the frozen models. `make openapi` regenerates the committed contract; CI rejects stale exports and publishes it as an Actions artifact. See [docs/handoff.md](docs/handoff.md) for who owns what and what is left.

## Models, API and frontend

```sh
make train        # fit, validate (§7.5 gates) and freeze models/ (≈25 s)
make watchtower   # one Watchtower pass: risk snapshots + alarms with hysteresis
make dev-api      # real §12 routes over the frozen models
make dev-web      # Next.js app; uses the API when /healthz reports mode=models
```

**Models** (`ml/`, trained from `feat.*` as `app_rw`; train ≤2021, calibrate 2022, test 2023–2026):

| Model | Held-out result |
| --- | --- |
| Risk of getting cooked, per stage k=0..6 (boosted trees, Platt-calibrated) | AUC 0.834 enrollment-only, 0.940 after one term, 0.967 after three; calibration slope 0.87–1.14 |
| Time to degree p25/p50/p75 | MAE 0.47 y after one term (baseline 1.02 y); p25–p75 covers ~48% |
| Autopsy clusters (k-means, 5 patterns) | bootstrap ARI 0.92 mean |
| Twin matcher (Gower, caliper 0.10, SMD < 0.1 on work hours and load) | refuses below 30 balanced twins |

All six §7.5 gates pass (`models/manifest.json`). Isotonic calibration on ~300 rows failed the slope gate, so Platt scaling is used; the change is recorded in `ml/risk_model.py`. Artifacts are SHA-256 checked and the API refuses to start on a mismatch. CI retrains from scratch before running tests.

**API**: every §12 route is real, plus `/narrate`, `/voice`, `/students/{id}/memory` and `/audit/parse`. Every number carries a `tool_result_id`; narration is assembled from tokens and must pass the provenance check (§8.4) before it is shown. `DEMO_MODE=1` blocks all outbound calls: narration and voice replay from `app.llm_cache` / `app.voice_clip`, and the models run locally. Drill trajectories are written to the `app.drill_trajectory` hypertable and survival is aggregated in SQL; the Watchtower feeds `app.risk_snapshot` and the `app.risk_by_day_pattern` continuous aggregate.

**Frontend** (`web/`): a minimal landing page (walking crowd, COOKED mark, Google sign-in with a guest fallback) and the agent workspace at `/app`. You drop a degree audit (a real PDF read by Gemini, or a synthetic sample), a voice greets you, and seven agents run (Reader · Gemini, Matcher and Fire drill · Tiger Data, Watchtower and Repair · the COOKED model, Narrator · ElevenLabs, Memory · Backboard), each showing whether its sponsor is live or on a fallback. Then the dashboard appears. Ask follow-ups by voice (tap the orb) or text, e.g. "what if I take CMSC 341 instead of CMSC 313?", and get a spoken answer plus a visual. The advisor queue lives at `/app/advisor`. See `web/README.md`.

## Checks, accounts and deployment

```sh
make check
.venv/bin/python -m scripts.smoke_tiger
# Once provider keys/model IDs are configured:
.venv/bin/python -m scripts.smoke_gemini
.venv/bin/python -m scripts.smoke_backboard
.venv/bin/python -m scripts.smoke_elevenlabs
.venv/bin/python -m scripts.smoke_digitalocean
make smoke-e2e
```

Read [accounts checklist](docs/accounts.md), [smoke-test plan](docs/smoke-test-plan.md), and [DigitalOcean setup](docs/deployment.md). Provider smoke tests make billable calls only when explicitly run. They print no credentials or provider bodies. Exceptions are sanitized; use the service dashboard to investigate failures.

GitHub Actions runs real database/API tests against TimescaleDB, a Next.js production build, gitleaks, and OpenAPI drift checks. Eight ML/agent tests are skipped with explicit TODOs; green Phase 1 CI is not a claim that those guarantees exist. Required checks on `main`: **Database and API**, **Web build**, **Secret scan**. Deployments are disabled until configured, and then triggered only after those jobs pass on `main`.

Current results, blockers, URLs, and exact teammate responsibilities are in [SETUP_STATUS.md](SETUP_STATUS.md).
