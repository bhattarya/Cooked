PY := .venv/bin/python
COMPOSE ?= docker compose

.PHONY: setup db-up migrate load train watchtower test dev-api dev-web openapi check smoke-e2e
setup:
	python3 -m venv .venv
	$(PY) -m pip install -c requirements.lock -e '.[dev]'
	npm --prefix web ci
	.venv/bin/pre-commit install

db-up:
	$(COMPOSE) up -d --wait db

migrate:
	$(PY) -m scripts.migrate

load:
	$(PY) -m scripts.load
	$(PY) -m scripts.check_integrity

train:
	$(PY) -m ml.train

watchtower:
	WATCHTOWER_ONCE=1 $(PY) -m worker.watchtower

test:
	$(PY) -m pytest -ra

dev-api:
	$(PY) -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000

dev-web:
	npm --prefix web run dev

openapi:
	$(PY) -m scripts.export_openapi

check:
	.venv/bin/ruff check .
	$(PY) -m scripts.export_openapi --check
	npm --prefix web run build

smoke-e2e:
	$(PY) -m playwright install chromium
	$(PY) -m scripts.smoke_e2e
