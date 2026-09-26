FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
COPY requirements.lock ./
COPY api ./api
COPY scripts ./scripts
COPY worker ./worker
COPY ml ./ml
RUN pip install --no-cache-dir -c requirements.lock . && useradd --create-home cooked
USER cooked
EXPOSE 8080
CMD ["python", "-m", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8080"]
