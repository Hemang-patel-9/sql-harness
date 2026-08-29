const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export interface QueryResponse {
  question: string;
  sql: string;
  note: string;
}

export async function generateSql(question: string): Promise<QueryResponse> {
  const res = await fetch(`${API_BASE_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`API error ${res.status}: ${detail}`);
  }

  return res.json();
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
}

/**
 * Thrown by the auth calls below. `fieldErrors` is populated from FastAPI's
 * pydantic 422 body (keyed by field name) so forms can show the message next
 * to the right input; `message` is always set for a form-level fallback.
 */
export class ApiError extends Error {
  status: number;
  fieldErrors: Record<string, string>;

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

interface UserPayload {
  id: string;
  email: string;
  full_name: string | null;
}

function toAuthUser(payload: UserPayload): AuthUser {
  return { id: payload.id, email: payload.email, fullName: payload.full_name ?? payload.email };
}

async function parseApiError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // no JSON body
  }

  const detail = (body as { detail?: unknown } | null)?.detail;

  if (Array.isArray(detail)) {
    const fieldErrors: Record<string, string> = {};
    for (const item of detail) {
      const loc = Array.isArray((item as { loc?: unknown }).loc) ? (item as { loc: unknown[] }).loc : [];
      const field = loc[loc.length - 1];
      const msg = (item as { msg?: unknown }).msg;
      if (typeof field === "string" && typeof msg === "string") {
        fieldErrors[field] = msg.replace(/^Value error,\s*/, "");
      }
    }
    const message = Object.values(fieldErrors)[0] ?? "Please check the form and try again.";
    return new ApiError(res.status, message, fieldErrors);
  }

  if (typeof detail === "string") {
    return new ApiError(res.status, detail);
  }

  return new ApiError(res.status, `Something went wrong (${res.status}). Please try again.`);
}

export async function signup(input: {
  fullName: string;
  email: string;
  password: string;
}): Promise<AuthUser> {
  const res = await fetch(`${API_BASE_URL}/api/auth/signup`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      full_name: input.fullName,
      email: input.email,
      password: input.password,
    }),
  });
  if (!res.ok) throw await parseApiError(res);
  return toAuthUser(await res.json());
}

export async function login(input: { email: string; password: string }): Promise<AuthUser> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await parseApiError(res);
  return toAuthUser(await res.json());
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
    credentials: "include",
  });
  if (res.status === 401) return null;
  if (!res.ok) throw await parseApiError(res);
  return toAuthUser(await res.json());
}

export type DbEngine = "postgresql" | "mysql";
export type SslMode = "disable" | "require";
export type ConnectionStatus = "untested" | "connected" | "failed";

export interface Connection {
  id: string;
  label: string;
  engine: DbEngine;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  sslMode: SslMode;
  status: ConnectionStatus;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestDetail: string | null;
  createdAt: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  detail: string;
  currentUser: string | null;
  currentDatabase: string | null;
  tableCount: number | null;
  latencyMs: number | null;
}

interface ConnectionPayload {
  id: string;
  label: string;
  engine: DbEngine;
  host: string;
  port: number;
  database_name: string;
  username: string;
  ssl_mode: SslMode;
  status: ConnectionStatus;
  last_tested_at: string | null;
  last_test_ok: boolean | null;
  last_test_detail: string | null;
  created_at: string;
}

function toConnection(payload: ConnectionPayload): Connection {
  return {
    id: payload.id,
    label: payload.label,
    engine: payload.engine,
    host: payload.host,
    port: payload.port,
    databaseName: payload.database_name,
    username: payload.username,
    sslMode: payload.ssl_mode,
    status: payload.status,
    lastTestedAt: payload.last_tested_at,
    lastTestOk: payload.last_test_ok,
    lastTestDetail: payload.last_test_detail,
    createdAt: payload.created_at,
  };
}

export async function listConnections(): Promise<Connection[]> {
  const res = await fetch(`${API_BASE_URL}/api/connections`, {
    credentials: "include",
  });
  if (!res.ok) throw await parseApiError(res);
  const payload: ConnectionPayload[] = await res.json();
  return payload.map(toConnection);
}

export async function createConnection(input: {
  label: string;
  engine: DbEngine;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  password: string;
  sslMode: SslMode;
}): Promise<Connection> {
  const res = await fetch(`${API_BASE_URL}/api/connections`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: input.label,
      engine: input.engine,
      host: input.host,
      port: input.port,
      database_name: input.databaseName,
      username: input.username,
      password: input.password,
      ssl_mode: input.sslMode,
    }),
  });
  if (!res.ok) throw await parseApiError(res);
  return toConnection(await res.json());
}

export async function updateConnection(
  id: string,
  input: {
    label: string;
    engine: DbEngine;
    host: string;
    port: number;
    databaseName: string;
    username: string;
    /** Omit (or leave undefined) to keep the currently stored password. */
    password?: string;
    sslMode: SslMode;
  },
): Promise<Connection> {
  const res = await fetch(`${API_BASE_URL}/api/connections/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: input.label,
      engine: input.engine,
      host: input.host,
      port: input.port,
      database_name: input.databaseName,
      username: input.username,
      ...(input.password ? { password: input.password } : {}),
      ssl_mode: input.sslMode,
    }),
  });
  if (!res.ok) throw await parseApiError(res);
  return toConnection(await res.json());
}

export async function deleteConnection(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/connections/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw await parseApiError(res);
}

export async function testConnection(id: string): Promise<ConnectionTestResult> {
  const res = await fetch(`${API_BASE_URL}/api/connections/${id}/test`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) throw await parseApiError(res);
  const payload = await res.json();
  return {
    ok: payload.ok,
    detail: payload.detail,
    currentUser: payload.current_user,
    currentDatabase: payload.current_database,
    tableCount: payload.table_count,
    latencyMs: payload.latency_ms,
  };
}
