# Backend — FastAPI

## Setup

```bash
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

- API root: http://localhost:8000
- Interactive docs: http://localhost:8000/docs

## Endpoints

| Method | Path          | Description                          |
| ------ | ------------- | ------------------------------------ |
| GET    | `/`           | Health check                        |
| GET    | `/api/health` | Health check                        |
| POST   | `/api/query`  | Translate a question into SQL (stub) |

`POST /api/query` body:

```json
{ "question": "Show all users who signed up last week" }
```

The translation logic lives in `app/services.py` — replace the stub with a real
model/LLM call.
