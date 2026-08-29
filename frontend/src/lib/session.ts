import { createPersistedStore } from "./store";

/**
 * The signed-in user. Sourced from the backend (httpOnly session cookie +
 * GET /api/auth/me) — never persisted client-side, since the cookie is
 * already the source of truth and isn't readable from JS.
 */
export interface Session {
  id: string;
  email: string;
  fullName: string;
}

export const sidebarCollapsedStore = createPersistedStore<boolean>({
  key: "sqlharness.sidebar.collapsed",
  fallback: false,
  parse: (raw) => raw === "1",
  serialize: (value) => (value ? "1" : "0"),
});
