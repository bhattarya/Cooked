# COOKED

Know you are cooked before it is too late — and get un-cooked.

Phase 1 foundation for HackUMBC 2026, Career Pathways & Degree ROI. **All data is synthetic, CC0.** No records describe real UMBC students, employers, courses, or outcomes. Do not upload real student data. This is a demo, not academic or financial advice.

The build plan PDF is the design reference. Dhruv owns infrastructure and then frontend; one teammate owns backend/ML/agents, and one owns frontend. Models, agents, production prompts, predictions, and voice rendering are not implemented here. API product routes return `mock: true`, empty collections, and null predictions.

## Getting started

Install Python 3.12, Node.js 22+, Git, and a running Docker engine with Compose. On this Mac, Colima and standalone `docker-compose` are installed; run `colima start` from your terminal and use `make db-up COMPOSE=docker-compose` if the `docker compose` plugin is unavailable.

```sh
git clone https://github.com/bhattarya/Cooked.git
cd Cooked
# Until the foundation PR is merged:
git checkout feat/phase1-foundation
cp .env.example .env
```

Edit `.env` locally. Never paste credentials into chat, screenshots, issues, or commits. For local development set `POSTGRES_PASSWORD` to a generated password and make `DATABASE_URL` use `owner` with that same password. Use `localhost:5432/cooked?sslmode=disable` for all three URLs, with separate passwords for `app_rw` and `agent_ro`. URL-encode password punctuation, or use generated hex passwords. For Tiger use its actual hostname, port, database and service administrator URL with `sslmode=require`; all three URLs must point at the same service/database.

```sh
make setup
make db-up                    # skip when using Tiger Cloud
make migrate
make load
make test
make dev-api                  # terminal 1: http://localhost:8000
make dev-web                  # terminal 2: http://localhost:3000
```

Python and Next.js both read the repository's root `.env`; shell environment values take precedence. `NEXT_PUBLIC_API_URL=http://localhost:8000` and `CORS_ORIGINS=http://localhost:3000` connect the browser to the local API. Only `NEXT_PUBLIC_` values are bundled into browser JavaScript. Changing them on DigitalOcean requires rebuilding the web component.

`make setup` installs the pre-commit gitleaks hook. Run `.venv/bin/pre-commit run --all-files` before committing. API keys are optional for the scaffold; database credentials are required for a healthy `/healthz`. A missing DB/cache returns HTTP 503. Missing ML artifacts are explicitly reported as `artifact_checksum: not_configured`; HTTP 200 means infrastructure readiness only.

## Database

`db/00_extensions.sql` through `06_roles_views.sql` are applied in order with a checksum ledger and advisory lock. Reruns skip applied files; editing applied migrations is rejected. Use a dedicated COOKED service/database: role names are cluster-wide, and setup revokes PUBLIC temporary-table and public-schema creation privileges. `DATABASE_URL` is the service administrator/migration connection, acting as the `owner` role for application objects. On Tiger the new `owner` role is NOLOGIN, granted to the existing service administrator; no provider-admin password is copied or changed. Local Docker uses its `owner` bootstrap account. API and worker use only `DATABASE_URL_APP`.

Set `DATABASE_URL_APP` and `DATABASE_URL_AGENT` with your chosen passwords **before** `make migrate`; the migration runner provisions those logins. It sends SCRAM verifiers rather than plaintext passwords to SQL. Existing elevated app roles cause setup to fail. `agent_ro` can select only allowlisted `v` views, defaults to read-only transactions, and has a 3-second statement timeout. System catalogs remain visible as in normal PostgreSQL. `app_rw` reads `feat`/`v`, writes `app`, and cannot access `raw`.

`make load` downloads the six files from the [pinned synthetic dataset](https://github.com/jasonpaluck/hackumbc-2026/tree/41398972ce9ce8c6756159207b00386a75ed5be5). SHA-256, headers and exact row counts are in `db/dataset.json`. Downloads and generated audio live under ignored `data/`. Loading replaces raw data and derived person features atomically; it preserves application events/cache. Run loads before backend begins writing derived labels/modes: refreshing features resets `mode` to NULL.

Raw fields remain TEXT, including literal `Not Applicable`; typed `feat` views apply `NULLIF` before casting. `No Response` remains a distinct category. `feat.person_term` excludes Summer and IP rows. Its dates are January 15/August 25 and `term_idx = 2*year + is_fall`; `k` numbers observed completed regular terms, without inventing skipped terms or transfer credits. The deterministic alumni `cooked` label uses time-to-degree >5 years or at least five **total** withdrawals (including Summer). Current labels/outcomes and all modes stay NULL. Backend owns training/splits/clustering.

Expected raw counts: alumni 3,200; current 1,800; transcripts 140,458; employment 6,028; experience 20,059; catalog 72. `make load` and `scripts.check_integrity` validate these. Tests independently recompute completed regular-term features and exercise actual restricted DB connections.

Local/CI image: TimescaleDB 2.18.2 on PostgreSQL 17. SQL requires TimescaleDB >=2.18 and uses columnstore syntax; the exact Tiger version must still be recorded at service creation. See [database compatibility](docs/database.md) for changes from the PDF.

## API and frontend handoff

Open [docs/openapi.json](docs/openapi.json), or local [Swagger UI](http://localhost:8000/docs). `make openapi` regenerates the committed contract; CI rejects stale exports and publishes it as an Actions artifact. Every §12 route exists. These are **draft mock contracts for teammate review**, not completed backend behavior. See [handoff notes](docs/handoff.md) and share interface changes in the group chat before implementation.

`web/` is a minimal Next.js page with a real browser health request. `worker/watchtower.py` stays alive and handles shutdown, but schedules nothing. `ml/`, `api/agents`, `api/tools`, the evidence notebook, and provenance module are placeholders. No model binaries or reproduced evidence claims are included.

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
