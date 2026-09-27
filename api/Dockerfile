FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
COPY requirements.lock ./
COPY api ./api
COPY scripts ./scripts
COPY worker ./worker
COPY ml ./ml
# frozen, checksummed artifacts; the API refuses to start if they were modified
COPY models ./models
COPY db/dataset.json ./db/dataset.json
RUN pip install --no-cache-dir -c requirements.lock . && useradd --create-home cooked
# api/distribution.py reads data/raw/*.csv directly (cohort distributions, fall-schedule catalog
# lookups); data/raw/ isn't in the repo (it's fetched at DB-seed time by scripts/load.py), so pull
# the same pinned, checksummed CC0 dataset here too, at build time.
RUN python -c "from scripts.load import fetch_files; fetch_files()"
USER cooked
EXPOSE 8080
CMD ["python", "-m", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8080"]
