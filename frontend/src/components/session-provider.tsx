"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { sessionStore, type Session } from "../lib/session";
import { useIsMounted, useStore } from "../lib/store";

interface SessionValue {
  session: Session | null;
  /** False until the browser has been able to read localStorage. */
  ready: boolean;
  signIn: (session: Session) => void;
  signOut: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useStore(sessionStore);
  const ready = useIsMounted();
  const router = useRouter();

  const signIn = useCallback((next: Session) => {
    sessionStore.set(next);
  }, []);

  const signOut = useCallback(() => {
    sessionStore.set(null);
    router.push("/login");
  }, [router]);

  const value = useMemo(
    () => ({ session, ready, signIn, signOut }),
    [session, ready, signIn, signOut],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used inside <SessionProvider>");
  }
  return value;
}
