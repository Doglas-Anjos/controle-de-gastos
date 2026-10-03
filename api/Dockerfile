FROM python:3.11-slim
WORKDIR /app
COPY api/pyproject.toml api/pyproject.toml
COPY api/src api/src
RUN pip install --no-cache-dir ./api
ENV GASTOS_DB_PATH=/app/data/gastos.db
EXPOSE 8000
CMD ["uvicorn", "gastos.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
