"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Navbar } from "./navbar";
import { DesktopSidebar, MobileSidebar } from "./sidebar";
import { Brand } from "./brand";
import { useSession } from "./session-provider";
import { sidebarCollapsedStore } from "../lib/session";
import { useStore } from "../lib/store";

export function AppShell({ children }: { children: ReactNode }) {
  const { session, ready } = useSession();
  const router = useRouter();

  const collapsed = useStore(sidebarCollapsedStore);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleCollapsed = useCallback(() => {
    sidebarCollapsedStore.set(!sidebarCollapsedStore.get());
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    if (ready && !session) router.replace("/login");
  }, [ready, session, router]);

  if (!ready || !session) {
    return (
      <div className="grid min-h-dvh place-items-center bg-paper">
        <Brand href="/login" caretClassName="caret-blink" />
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <Navbar onOpenMenu={() => setDrawerOpen(true)} />

      <div className="flex flex-1">
        <DesktopSidebar collapsed={collapsed} onToggle={toggleCollapsed} />
        <MobileSidebar open={drawerOpen} onClose={closeDrawer} />

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
