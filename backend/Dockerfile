FROM python:3.12-slim
WORKDIR /app
COPY backend/pyproject.toml ./pyproject.toml
COPY backend/app ./app
COPY contracts /contracts
RUN pip install --no-cache-dir .
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
