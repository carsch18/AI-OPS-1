# Workflow Engine Microservice

Visual workflow automation engine for AIOps - N8N/Zapier-style automation.

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Run the service
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/workflows` | List all workflows |
| POST | `/api/workflows` | Create workflow |
| GET | `/api/workflows/:id` | Get workflow details |
| PUT | `/api/workflows/:id` | Update workflow |
| DELETE | `/api/workflows/:id` | Delete workflow |
| POST | `/api/workflows/:id/execute` | Execute workflow |
| GET | `/api/workflows/:id/executions` | Execution history |
| POST | `/api/executions/:id/approve` | Approve gate |
| POST | `/api/executions/:id/reject` | Reject gate |

## Database

Uses PostgreSQL (shared with main AIOps database).

## Architecture

```
workflow-engine/
├── main.py              # FastAPI application
├── models.py            # Pydantic models
├── database.py          # Database connection & schema
├── workflow_executor.py # Execution engine
├── node_registry.py     # Available node types
└── requirements.txt     # Dependencies
```
