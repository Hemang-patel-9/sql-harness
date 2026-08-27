import { createPersistedStore } from "./store";

/**
 * Demo session. Kept in localStorage — there is no real authentication behind
 * this. Swap the store for real auth calls when the backend grows an
 * /api/auth surface.
 */
export interface Session {
  name: string;
  email: string;
}

export const sessionStore = createPersistedStore<Session | null>({
  key: "querysmith.session",
  fallback: null,
  parse(raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<Session>;
      if (!parsed.name || !parsed.email) return null;
      return { name: parsed.name, email: parsed.email };
    } catch {
      return null;
    }
  },
  serialize: (value) => JSON.stringify(value),
});

export const sidebarCollapsedStore = createPersistedStore<boolean>({
  key: "querysmith.sidebar.collapsed",
  fallback: false,
  parse: (raw) => raw === "1",
  serialize: (value) => (value ? "1" : "0"),
});
