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
| GET    | `/api/health/db` | PostgreSQL connectivity probe (read-only) |
| POST   | `/api/auth/signup` | Create an account, sign in            |
| POST   | `/api/auth/login`  | Sign in                               |
| POST   | `/api/auth/logout` | Revoke the current session            |
| GET    | `/api/auth/me`     | Current signed-in user                |

`POST /api/query` body:

```json
{ "question": "Show all users who signed up last week" }
```

The translation logic lives in `app/services.py` — replace the stub with a real
model/LLM call.

## Auth

`/api/auth/*` (`app/routes_auth.py`) is a real signup/login flow against the
`users`/`sessions`/`tenants`/`memberships` tables in `schema.sql`:

- Passwords are hashed with bcrypt (`app/security.py`); never stored or
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
`app/db.py` (`get_session` for plain requests, `tenant_session` to pin a
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

`/api/connections/*` (`app/routes_connections.py`) lets a signed-in user
register a Postgres or MySQL database and test reaching it:

- Passwords are encrypted, not hashed — see `app/crypto.py`. AES-256-GCM
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
  short-lived connection to the target database (`app/db_probe.py`) and
  runs a small info query (current user, current database, table count).
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
