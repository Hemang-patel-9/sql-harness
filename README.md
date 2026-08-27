# Natural-Language-to-SQL

Translate natural-language questions into SQL. Monorepo with a Next.js frontend
and a FastAPI backend.

```
frontend/   Next.js 16 (App Router, TypeScript, Tailwind)
backend/    FastAPI (Python)
```

## Quick start

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows  (source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
copy .env.example .env           # cp on macOS/Linux
uvicorn app.main:app --reload --port 8000
```

Runs at http://localhost:8000 — docs at http://localhost:8000/docs.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs at http://localhost:3000. Configure the API URL in `frontend/.env.local`
(`NEXT_PUBLIC_API_BASE_URL`, defaults to `http://localhost:8000`).

## How it fits together

The frontend posts a question to `POST /api/query`; the backend returns a SQL
string. The translation is currently a stub in `backend/app/services.py` —
replace it with a real model/LLM call.
