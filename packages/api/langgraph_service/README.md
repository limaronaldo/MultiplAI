# MultiplAI LangGraph Service

Python backend using LangGraph for AI orchestration.

## Setup

### Using uv (recommended)

```bash
cd langgraph_service
uv sync
uv run uvicorn multiplai.main:app --reload
```

### Using pip

```bash
cd langgraph_service
pip install -e .
uvicorn multiplai.main:app --reload
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

- `ANTHROPIC_API_KEY` - Claude API key
- `GITHUB_TOKEN` - GitHub personal access token
- `DATABASE_URL` - PostgreSQL connection string
- `LINEAR_API_KEY` - (optional) Linear API key

## Development

```bash
# Run tests
uv run pytest

# Type checking
uv run mypy src/
```
