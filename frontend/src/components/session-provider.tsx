"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getCurrentUser, login as apiLogin, logout as apiLogout, signup as apiSignup } from "../lib/api";
import type { AuthUser } from "../lib/api";

interface SessionValue {
  session: AuthUser | null;
  /** False until the initial /api/auth/me check has resolved. */
  ready: boolean;
  login: (input: { email: string; password: string }) => Promise<void>;
  signup: (input: { fullName: string; email: string; password: string }) => Promise<void>;
  signOut: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then((user) => {
        if (!cancelled) setSession(user);
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (input: { email: string; password: string }) => {
    const user = await apiLogin(input);
    setSession(user);
  }, []);

  const signup = useCallback(
    async (input: { fullName: string; email: string; password: string }) => {
      const user = await apiSignup(input);
      setSession(user);
    },
    [],
  );

  const signOut = useCallback(() => {
    setSession(null);
    apiLogout().catch(() => {
      /* cookie is best-effort cleared client-side regardless */
    });
    router.push("/login");
  }, [router]);

  const value = useMemo(
    () => ({ session, ready, login, signup, signOut }),
    [session, ready, login, signup, signOut],
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
