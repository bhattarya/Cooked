PYTHON ?= python3
PY := .venv/bin/python
COMPOSE ?= docker compose

.PHONY: help bootstrap setup env db-up db-down migrate load train watchtower dev dev-api dev-web \
	test e2e openapi check smoke-e2e

help: ## Show every target
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-12s %s\n", $$1, $$2}'

bootstrap: setup env db-up migrate load ## Fresh clone -> installed, local DB migrated and loaded
	@echo "Ready. Run: make dev   (API http://localhost:8000, web http://localhost:3000)"

setup: ## Python venv + deps, web deps, pre-commit hook
	@$(PYTHON) -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else "Python 3.11+ required: make setup PYTHON=python3.12")'
	test -d .venv || $(PYTHON) -m venv .venv
	$(PY) -m pip install -q --upgrade pip
	$(PY) -m pip install -q -c requirements.lock -e '.[dev]'
	npm --prefix web ci
	.venv/bin/pre-commit install

env: ## Create .env with generated local DB passwords (never overwrites)
	$(PY) -m scripts.bootstrap_env

db-up: ## Start local TimescaleDB (skip when using Tiger Cloud)
	$(COMPOSE) up -d --wait db

db-down: ## Stop local TimescaleDB (data volume is kept)
	$(COMPOSE) down

migrate: ## Apply db/*.sql migrations
	$(PY) -m scripts.migrate

load: ## Download the pinned dataset, load it, run integrity checks
	$(PY) -m scripts.load
	$(PY) -m scripts.check_integrity

train: ## Retrain and freeze models/ (only when ml/ changes)
	$(PY) -m ml.train

watchtower: ## One Watchtower pass: risk snapshots + alarms
	WATCHTOWER_ONCE=1 $(PY) -m worker.watchtower

dev: ## Run API and web together (Ctrl-C stops both)
	$(MAKE) -j2 dev-api dev-web

dev-api: ## API with reload on http://localhost:8000 (docs at /docs)
	$(PY) -m uvicorn api.main:app --reload --reload-dir api --reload-dir ml --host 0.0.0.0 --port 8000

dev-web: ## Web on http://localhost:3000
	npm --prefix web run dev

test: ## Python tests (needs the loaded DB)
	$(PY) -m pytest -ra

e2e: ## Browser walkthrough of the demo (needs make dev running)
	$(PY) -m playwright install chromium
	$(PY) -m scripts.e2e_demo

openapi: ## Regenerate docs/openapi.json after API changes
	$(PY) -m scripts.export_openapi

check: ## What CI checks besides tests: lint, contract, web build
	.venv/bin/ruff check .
	$(PY) -m scripts.export_openapi --check
	npm --prefix web run build

smoke-e2e: ## Deployed-site smoke test
	$(PY) -m playwright install chromium
	$(PY) -m scripts.smoke_e2e
