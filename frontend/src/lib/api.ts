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
