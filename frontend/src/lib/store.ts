import { useSyncExternalStore } from "react";

export interface Store<T> {
  /** Client snapshot. Reads localStorage once, then serves a stable cache. */
  get: () => T;
  /** Server/hydration snapshot — always the fallback. */
  getServer: () => T;
  set: (value: T) => void;
  subscribe: (listener: () => void) => () => void;
}

/**
 * A tiny external store backed by localStorage.
 *
 * Components read it through `useSyncExternalStore`, so the first render
 * matches the server (the fallback) and React re-renders with the stored
 * value right after hydration — no effect, no state sync, no mismatch.
 */
export function createPersistedStore<T>(options: {
  key: string;
  fallback: T;
  parse: (raw: string) => T | null;
  serialize: (value: T) => string;
}): Store<T> {
  const { key, fallback, parse, serialize } = options;

  let cache: T = fallback;
  let loaded = false;
  const listeners = new Set<() => void>();

  function load() {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        const parsed = parse(raw);
        if (parsed !== null) cache = parsed;
      }
    } catch {
      /* storage unavailable — keep the fallback */
    }
  }

  return {
    get() {
      load();
      return cache;
    },
    getServer() {
      return fallback;
    },
    set(value) {
      loaded = true;
      cache = value;
      try {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, serialize(value));
      } catch {
        /* storage unavailable — the value still lives in memory */
      }
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

const neverChanges = () => () => {};

/**
 * False on the server and during hydration, true afterwards. Use it to gate
 * anything that can only be known in the browser.
 */
export function useIsMounted(): boolean {
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}
