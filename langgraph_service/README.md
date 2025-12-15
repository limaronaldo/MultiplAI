# LangGraph Service

This is a FastAPI service built with LangGraph.

## Setup

### Using uv (Recommended)

1. Install uv: `pip install uv`
2. Install dependencies: `uv sync`
3. Activate virtual environment: `source .venv/bin/activate`

### Using pip

1. Create virtual environment: `python -m venv .venv`
2. Activate virtual environment: `source .venv/bin/activate`
3. Install dependencies: `pip install -r requirements.txt`

## Environment Variables

Set the following environment variables:

- `ANTHROPIC_API_KEY`: Your Anthropic API key
- `GITHUB_TOKEN`: Your GitHub personal access token
- `DATABASE_URL`: Database connection URL
- `LINEAR_API_KEY`: Your Linear API key

## Development

Run tests: `pytest`

Run type checking: `mypy src/`

## Running the Service

Start the server: `uvicorn src.main:app --reload`