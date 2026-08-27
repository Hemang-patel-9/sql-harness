"use client";

import { AnimatePresence, motion } from "motion/react";
import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Brand } from "./brand";
import { IconButton } from "./ui/icon-button";
import { NAV_ITEMS, isActivePath } from "../lib/nav";
import { ease, spring, springSoft } from "../lib/motion";
import { cn } from "../lib/utils";

const RAIL_WIDTH = 68;
const PANEL_WIDTH = 244;

/* ------------------------------------------------------------------ */
/* Shared list                                                         */
/* ------------------------------------------------------------------ */

function SidebarNav({
  collapsed,
  caretId,
  onNavigate,
}: {
  collapsed: boolean;
  /** Unique per rendered nav so the desktop and mobile carets never collide. */
  caretId: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2.5">
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="eyebrow px-3 pb-3 pt-2"
          >
            Workspace
          </motion.p>
        )}
      </AnimatePresence>

      <ul className={cn("flex flex-col gap-0.5", collapsed && "pt-2")}>
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;

          return (
            <li key={item.href} className="relative">
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={undefined}
                className={cn(
                  "group relative flex h-10 items-center rounded-lg",
                  "transition-colors duration-150",
                  collapsed ? "justify-center px-0" : "gap-3 px-3",
                  active
                    ? "bg-wash text-ink"
                    : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                {active && (
                  <motion.span
                    layoutId={caretId}
                    aria-hidden
                    transition={spring}
                    className={cn(
                      "absolute bottom-0 top-0 my-auto h-5 w-[3px] rounded-full bg-marker",
                      collapsed ? "left-1" : "left-1.5",
                    )}
                  />
                )}

                <Icon
                  className={cn(
                    "h-4.5 w-4.5 shrink-0 transition-transform duration-150",
                    "group-hover:scale-110",
                  )}
                />

                <AnimatePresence initial={false}>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={ease}
                      className={cn(
                        "truncate text-sm",
                        active ? "font-medium" : "font-normal",
                      )}
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>

              {/* Rail tooltip — the label has to live somewhere when collapsed. */}
              {collapsed && (
                <span
                  role="tooltip"
                  className={cn(
                    "pointer-events-none absolute left-[calc(100%+0.5rem)] top-1/2 z-50",
                    "-translate-y-1/2 scale-95 whitespace-nowrap rounded-md border border-line",
                    "bg-surface px-2 py-1 text-xs text-ink opacity-0 shadow-lg",
                    "transition duration-150 group-hover:scale-100 group-hover:opacity-100",
                    "group-focus-visible:scale-100 group-focus-visible:opacity-100",
                  )}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Desktop / tablet: an in-flow column that collapses to a rail        */
/* ------------------------------------------------------------------ */

export function DesktopSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? RAIL_WIDTH : PANEL_WIDTH }}
      transition={springSoft}
      className={cn(
        "sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 flex-col",
        "border-r border-line bg-surface md:flex",
      )}
    >
      <SidebarNav collapsed={collapsed} caretId="nav-caret-desktop" />

      <div className="border-t border-line p-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className={cn(
            "flex h-10 w-full items-center rounded-lg text-ink-2",
            "transition-colors hover:bg-surface-2 hover:text-ink",
            collapsed ? "justify-center" : "gap-3 px-3",
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4.5 w-4.5 shrink-0" />
          ) : (
            <PanelLeftClose className="h-4.5 w-4.5 shrink-0" />
          )}
          <AnimatePresence initial={false}>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={ease}
                className="text-sm"
              >
                Collapse
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile: off-canvas drawer                                           */
/* ------------------------------------------------------------------ */

export function MobileSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  // Close on navigation.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Escape to close, and hold the page still behind the drawer.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="md:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-ink/25 backdrop-blur-[2px]"
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={springSoft}
            className={cn(
              "fixed inset-y-0 left-0 z-50 flex w-[min(17rem,82vw)] flex-col",
              "border-r border-line bg-surface",
            )}
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-3">
              <Brand className="ml-1" />
              <IconButton label="Close navigation" onClick={onClose}>
                <X className="h-4.5 w-4.5" />
              </IconButton>
            </div>

            <SidebarNav
              collapsed={false}
              caretId="nav-caret-mobile"
              onNavigate={onClose}
            />
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
