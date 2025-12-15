FROM python:3.12-slim

RUN pip install uv

WORKDIR /app

COPY pyproject.toml ./
COPY src/ ./src/

RUN uv sync --no-dev

EXPOSE 8000

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]