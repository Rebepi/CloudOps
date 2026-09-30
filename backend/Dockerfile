FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt constraints.txt ./
RUN pip install --no-cache-dir -r requirements.txt
RUN useradd --create-home --uid 10001 cloudops
COPY --chown=cloudops:cloudops . .
USER cloudops
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM base AS test
ENV RUFF_CACHE_DIR=/tmp/cloudops-ruff-cache PYTEST_ADDOPTS="-o cache_dir=/tmp/cloudops-pytest-cache"
USER root
RUN pip install --no-cache-dir -r requirements-dev.txt
USER cloudops
CMD ["python", "-m", "pytest", "-q"]

FROM base AS runtime
