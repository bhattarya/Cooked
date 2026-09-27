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
# raw CSVs api/distribution.py reads directly (cohort distributions, fall-schedule catalog lookups)
COPY data/raw ./data/raw
RUN pip install --no-cache-dir -c requirements.lock . && useradd --create-home cooked
USER cooked
EXPOSE 8080
CMD ["python", "-m", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8080"]
