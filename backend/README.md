# Backend — FastAPI

## Project layout

Feature-based packages under `app/`, plus `core/` for cross-cutting concerns.
Each feature package owns its own `routes.py` (FastAPI router), `repo.py`
(raw SQL data access), and `schemas.py` (Pydantic models); add whatever else
a given feature needs (`connections/probe.py`, `schema_explorer/introspect.py`).
A new module follows the same shape: a package under `app/`, wired into
`app/main.py` with `app.include_router(...)`.

```
app/
  core/             # config, db session, password/token hashing, secret encryption
  auth/              # signup/login/session cookies
  connections/       # customer DB connections: CRUD, "fire demo query"
  schema_explorer/   # introspects a connection's tables/columns/FKs/indexes
  query/             # NL-to-SQL translation (stub today)
  vectorstore/        # Qdrant client + collection config (dense/sparse/filters; no retrieval yet)
  main.py            # assembles the FastAPI app from the packages above
```

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
| GET    | `/api/health/db` | PostgreSQL connectivity probe (read-only) |
| GET    | `/api/health/qdrant` | Qdrant connectivity probe (read-only) |
| POST   | `/api/auth/signup` | Create an account, sign in            |
| POST   | `/api/auth/login`  | Sign in                               |
| POST   | `/api/auth/logout` | Revoke the current session            |
| GET    | `/api/auth/me`     | Current signed-in user                |
| GET    | `/api/connections/{id}/schema` | Last-fetched schema snapshot for a connection |
| POST   | `/api/connections/{id}/schema/fetch` | Connect and read tables/columns/foreign-keys/indexes |

`POST /api/query` body:

```json
{ "question": "Show all users who signed up last week" }
```

The translation logic lives in `app/query/service.py` — replace the stub with a
real model/LLM call.

## Auth

`/api/auth/*` (`app/auth/routes.py`) is a real signup/login flow against the
`users`/`sessions`/`tenants`/`memberships` tables in `schema.sql`:

- Passwords are hashed with bcrypt (`app/core/security.py`); never stored or
  logged in plaintext.
- Sessions are an opaque random token handed to the browser as an httpOnly,
  `SameSite=Lax` cookie (`sqlharness_session`); only its sha256 hash is
  stored, in `sessions.refresh_token_hash`. `GET /api/auth/me` resolves the
  cookie on every request.
- Signup auto-creates a personal tenant + `owner` membership for the new
  user, so the multi-tenant schema stays consistent even though there's no
  workspace-switching UI yet.
- Five consecutive failed logins lock the account for 15 minutes
  (`users.failed_login_count` / `locked_until`).
- Every signup/login/logout is written to `auth_events` for audit.
- Email verification is modeled in the schema (`user_tokens`) but not
  enforced yet — there's no mail provider configured to send the link.

## Database

Local PostgreSQL 18 listens on **port 5433**. Set the password in `.env`:

```
DATABASE_URL=postgresql+asyncpg://postgres:YOUR_PASSWORD@localhost:5433/nl2sql
```

`schema.sql` is the source of truth for the `nl2sql` schema — identity, tenancy
and access control. The app never creates or alters tables; apply it yourself:

```bash
psql -h localhost -p 5433 -U postgres -d nl2sql -f schema.sql
```

It is re-runnable (`IF NOT EXISTS` throughout). Multi-tenancy is shared-schema
with a `tenant_id` discriminator: `users` is a global identity, `memberships`
links a user to a tenant and carries the role. Connection plumbing lives in
`app/core/db.py` (`get_session` for plain requests, `tenant_session` to pin a
transaction to one tenant for row-level security).

### Row-level security (optional, not enabled)

Tenant isolation is enforced in the application. To enforce it in the database
too, run this once, connect the API as `nl2sql_app` (a non-owner role, so the
policies actually apply), and use `db.tenant_session(tenant_id)` — it issues the
`SET LOCAL app.tenant_id` that `current_tenant_id()` reads. A query that forgets
returns zero rows instead of another tenant's data.

```sql
CREATE ROLE nl2sql_app LOGIN PASSWORD 'change-me';
GRANT USAGE ON SCHEMA public TO nl2sql_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nl2sql_app;

ALTER TABLE tenants     ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON tenants
  USING (id = current_tenant_id());
CREATE POLICY tenant_isolation ON memberships
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation ON invitations
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation ON auth_events
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
CREATE POLICY tenant_isolation ON connections
  USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
```

`users`, `sessions` and `user_tokens` stay outside RLS on purpose: they are
global identity, and login happens before a tenant is known.

Every future tenant-owned table (queries, saved queries, schema snapshots)
takes the same shape: `tenant_id uuid NOT NULL REFERENCES tenants(id) ON
DELETE CASCADE`, an index leading with `tenant_id`, and a matching policy —
`connections` (below) is the first example of the pattern in use.

## Connections

`/api/connections/*` (`app/connections/routes.py`) lets a signed-in user
register a Postgres or MySQL database and test reaching it:

- Passwords are encrypted, not hashed — see `app/core/crypto.py`. AES-256-GCM
  with a server-held key (`CONNECTION_ENCRYPTION_KEY` in `.env`, base64,
  must decode to 32 bytes), AAD bound to `tenant_id:connection_id` so a
  copied ciphertext can't be decrypted under a different row. Generate a
  key with:

  ```bash
  python -c "import os,base64;print(base64.b64encode(os.urandom(32)).decode())"
  ```

  The app refuses to start without a valid key, the same way it refuses to
  start without a reachable database.
- `POST /api/connections/{id}/test` ("fire demo query") opens a real,
  short-lived connection to the target database (`app/connections/probe.py`)
  and runs a small info query (current user, current database, table count).
  Before connecting, the target host is resolved and checked against
  private/loopback/link-local/reserved ranges — connecting to internal
  addresses is refused by default. Set `ALLOW_PRIVATE_CONNECTION_HOSTS=true`
  in `.env` to lift that for local development (e.g. testing against your
  own `localhost:5433` Postgres).
- A connection's `password_ciphertext` is never selected into an API
  response; there is no endpoint that returns it.
- `PATCH /api/connections/{id}` edits a connection. Password is optional —
  omit it (or send blank) to keep the one already stored, or send a new one
  to replace it. Either way the edit resets `status` to `untested` and
  clears the previous test result: a changed connection hasn't been proven
  to work yet, so the UI asks for "fire demo query" again before trusting it.

## Schema explorer

`/api/connections/{id}/schema*` (`app/schema_explorer/`) reads a connected
database's own catalog — tables, columns, foreign keys, and indexes (primary
keys included) — using four read-only queries per engine (`introspect.py`).
Fetching is only allowed once a connection's last test succeeded (`status =
'connected'`), enforced server-side as a 400, not just hidden in the UI.

The result is persisted in `schema_snapshots` (one row per connection,
upserted on every fetch — `repo.py`), so `GET /api/connections/{id}/schema`
returns the last fetch instantly without re-connecting to the customer's
database. `POST .../schema/fetch` re-runs the introspection and overwrites
the stored snapshot.

## Vector store (Qdrant)

`app/vectorstore/` holds the Qdrant setup: connection plumbing and the
collection's schema. **No retrieval strategy is implemented yet** — no
embedding, indexing, search or ranking code exists; this is configuration
only, ready for that to be built on top.

- `client.py` — a cached `AsyncQdrantClient` (`get_client()`), plus `ping()`
  and `dispose()`, mirroring `app/core/db.py`'s shape.
- `collections.py` — the collection's vector schema, and `ensure_collection()`
  to provision it:
  - **Dense vector** (`"dense"`, cosine distance, size from
    `QDRANT_DENSE_VECTOR_SIZE` — depends on whichever embedding model gets
    chosen later).
  - **Sparse vector** (`"bm25"`) with `Modifier.IDF`, for BM25-style lexical
    matching alongside the dense vector.
  - **Metadata filter indexes** on `tenant_id`, `connection_id`,
    `schema_name`, `table_name`, `object_type` — keyword-indexed payload
    fields so a search can be scoped to one tenant/connection/table.
- `routes.py` — `GET /api/health/qdrant`, a read-only connectivity probe.

`ensure_collection()` is idempotent (checks `collection_exists` first) and is
called once at startup (`app/main.py`), logged but **non-fatal** if Qdrant is
unreachable — unlike Postgres, nothing depends on it yet, so a misconfigured
or momentarily-down cluster shouldn't take the API down. Unlike `schema.sql`,
there's no separate "apply by hand" step: creating a Qdrant collection is
idempotent and side-effect-free after the first run, so provisioning it at
startup is safe.

All five settings are required — no defaults, and the app refuses to start
without them, the same way it refuses to start without `DATABASE_URL`:

```
QDRANT_URL=https://xxxxxxxx.aws.cloud.qdrant.io
QDRANT_API_KEY=...
QDRANT_TIMEOUT_SECONDS=10
QDRANT_COLLECTION_NAME=schema_chunks
QDRANT_DENSE_VECTOR_SIZE=1536
```

Changing the vector schema (size, distance, sparse config, which fields are
indexed) requires dropping and recreating the collection by hand — edit
`collections.py`, then delete the collection in Qdrant and restart the app.
