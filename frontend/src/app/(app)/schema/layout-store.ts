import { createPersistedStore, type Store } from "../../../lib/store";

/** Where a table has been dragged to, keyed by table name. */
export type Overrides = Record<string, { x: number; y: number }>;

function parseOverrides(raw: string): Overrides | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const result: Overrides = {};
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        typeof value === "object" &&
        value !== null &&
        typeof (value as { x?: unknown }).x === "number" &&
        typeof (value as { y?: unknown }).y === "number"
      ) {
        result[name] = value as { x: number; y: number };
      }
    }
    return result;
  } catch {
    return null;
  }
}

const stores = new Map<string, Store<Overrides>>();

/**
 * A hand-arranged diagram is worth more than the automatic layout, so table
 * positions are remembered per connection on this device.
 *
 * One store per connection, memoised at module scope: the canvas remounts
 * whenever the connection changes, and a fresh store each time would re-read
 * storage on every mount. Reading through `useStore` keeps the server render
 * and the first client render agreeing on the empty fallback, then swaps in
 * the saved layout after hydration.
 */
export function layoutStore(connectionId: string): Store<Overrides> {
  const existing = stores.get(connectionId);
  if (existing) return existing;

  const store = createPersistedStore<Overrides>({
    key: `sqlharness.schema.layout.${connectionId}`,
    fallback: {},
    parse: parseOverrides,
    serialize: (value) => JSON.stringify(value),
  });
  stores.set(connectionId, store);
  return store;
}
