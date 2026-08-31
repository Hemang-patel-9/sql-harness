# Natural-Language-to-SQL

Translate natural-language questions into SQL. Monorepo with a Next.js frontend
and a FastAPI backend.

```
frontend/   Next.js 16 (App Router, TypeScript, Tailwind v4, Framer Motion)
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

Sign in with any name and email — authentication is a demo that stores the
session in `localStorage`. See `frontend/README.md` for the routes and the
design system.

## How it fits together

On the Query tab you pick one of your connected databases, then ask. The
frontend posts `{connection_id, question}` to `POST /api/query` with the
session cookie; the backend resolves that connection against your own tenant
and answers. Two stages run, and the Query tab renders both. First one
`claude-haiku-4-5` call reads out the question's structure — intent,
entities, metrics, filters, time range, grouping and ranking. Then a hybrid
search over Qdrant (dense on the question, BM25 on the extracted terms, top
6 each) is reranked by a `bge-reranker-v2-m3` cross-encoder to pick the
tables that could answer it. No SQL is generated yet. Only connections that
passed "fire demo query" are offered, and the server enforces that too.

The backend only allows CORS from `http://localhost:3000`. If you run the
frontend elsewhere, add that origin to `CORS_ORIGINS` in `backend/.env`.
