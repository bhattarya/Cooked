# Working on COOKED

Setup is one command. See the [README](README.md#getting-started): `make bootstrap`, then `make dev`.

## The loop

1. `git switch main && git pull`
2. `git switch -c feat/<short-name>` (or `fix/…`, `chore/…`). One topic per branch.
3. Make the change, then run the checks for what you touched (table below).
4. Commit, `git push -u origin HEAD`, and open a PR into `main`.
5. CI must be green: **Database and API**, **Web build**, **Secret scan**. Get one teammate to look before merging.
6. Merge with a merge commit, delete the branch, and everyone pulls.

Never push straight to `main`. Deploys run from `main` only after CI passes.

## What to run for what you touched

| You changed | Run before pushing | Also commit |
| --- | --- | --- |
| Anything in Python (`api/`, `ml/`, `worker/`, `scripts/`) | `make test` and `.venv/bin/ruff check .` | |
| API routes or schemas (`api/`) | `make openapi` | `docs/openapi.json` (CI rejects a stale one) |
| Models or features (`ml/`) | `make train`: all six gates must print PASS | `models/` (artifact, `arena.json`, manifest, training ids) |
| Database schema | add a **new** file `db/NN_name.sql`, then `make migrate` | never edit a migration that has been applied |
| `web/scripts/build-data.mjs` | `npm --prefix web run data` | `web/public/data/*.json` |
| Anything in `web/` | `npm --prefix web run lint` and `make check` | |
| The demo path | `make dev`, then `make e2e` in another terminal | |

`make check` runs what CI runs besides the tests: lint, the OpenAPI drift check and the production web build.

## Rules the product depends on

- **Synthetic data only.** Never commit or upload real student records, and never put real data through a provider.
- **Numbers come from tools.** Every number a user sees carries a `tool_result_id`. Narration is text plus value tokens and must pass `api/provenance.check`. Don't let an LLM write a digit.
- **Refuse rather than guess.** Fewer than 30 balanced twins, or a profile outside the training range, returns a refusal, not a number.
- **No leakage.** Features only use what is known after k completed terms. The quarantine list is in `ml/snapshots.py`, and `tests/test_no_leakage.py` enforces it.
- **Frozen models.** The API refuses to start if `models/` doesn't match `models/manifest.json`. Retrain with `make train` instead of editing artifacts.

## Secrets

- Keys live only in your `.env` (created by `make env`, gitignored) and in DigitalOcean encrypted env vars. Never commit or paste them.
- The pre-commit hook runs gitleaks, and CI runs it again.
- `NEXT_PUBLIC_*` values end up in the browser bundle, so never put a secret in one.

## Where things live

| Path | What |
| --- | --- |
| `db/` | Ordered SQL migrations: raw, feat, app schemas, hypertables, continuous aggregates, roles |
| `scripts/` | Loader, migrations, bootstrap, smoke tests, `e2e_demo.py` |
| `ml/` | Snapshots, model arena (`candidates.py`, `arena.py`), autopsy clusters, twins, shocks, fire drill, repair, gates, `train.py` |
| `models/` | Frozen artifact plus checksummed manifest (metrics and gate results) |
| `api/` | FastAPI app: `engine.py` (tools), `routes/product.py`, `provenance.py`, `providers/` (Gemini, ElevenLabs, Backboard) |
| `worker/` | Watchtower: scores every current student and manages alarms |
| `web/` | Next.js app: `app/page.tsx` landing, `app/app/` agent workspace + advisor view, `app/auth/` Firebase/Google sign-in + guest sessions, `lib/auth.ts` Firebase client, `proxy.ts` guards `/app` |
| `web/components/agent/` | Workspace state machine, voice orb, agent pipeline, dashboard, answer cards, sponsor chips |
| `api/agent.py` | Audit intake, spoken lines, question routing (Gemini function calling, local fallback) to tools |
| `tests/` | pytest suite (runs against a migrated, loaded database) |

## Gotchas we've hit

- **Switching branches in GitHub Desktop with uncommitted work stashes it** and it disappears from the folder. Commit (or push a WIP branch) before you switch.
- **Port 5432 already in use:** `make env` picks another port automatically, but only when it creates `.env`. With an existing `.env`, change `POSTGRES_PORT` and the three URLs together.
- **OpenAPI "stale" in CI but not locally:** regenerate with `make openapi` and commit the result. Response descriptions are pinned so the file doesn't depend on your Python version.
- **Changed `.env` and the web app didn't notice:** restart `make dev-web`. Next reads `NEXT_PUBLIC_*` at startup.
- **Docker not running:** `make db-up` fails. Start Docker Desktop (or `colima start`) and retry.
