"use client";

import { AnimatePresence, motion } from "motion/react";
import { Bell } from "lucide-react";
import { useState } from "react";
import { Dropdown } from "./ui/dropdown";
import { spring } from "../lib/motion";
import { cn } from "../lib/utils";

interface Note {
  id: string;
  title: string;
  detail: string;
  at: string;
  unread: boolean;
}

const DEMO_NOTES: Note[] = [
  {
    id: "n1",
    title: "Query finished",
    detail: "monthly_active_users returned 1,284 rows in 0.42s",
    at: "2 min ago",
    unread: true,
  },
  {
    id: "n2",
    title: "Schema changed",
    detail: "orders gained 3 columns: refunded_at, channel, coupon_code",
    at: "1 hr ago",
    unread: true,
  },
  {
    id: "n3",
    title: "Connection restored",
    detail: "analytics-prod is reachable again",
    at: "Yesterday",
    unread: true,
  },
  {
    id: "n4",
    title: "Query saved",
    detail: "Top customers by lifetime value is now in Saved",
    at: "2 days ago",
    unread: false,
  },
];

export function NotificationsMenu() {
  const [notes, setNotes] = useState(DEMO_NOTES);
  const unread = notes.filter((note) => note.unread).length;

  return (
    <Dropdown
      triggerLabel={
        unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
      }
      panelClassName="w-[min(20rem,calc(100vw-1.5rem))]"
      trigger={
        <>
          <Bell className="h-4 w-4" />
          <AnimatePresence>
            {unread > 0 && (
              <motion.span
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={spring}
                className={cn(
                  "absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full",
                  "bg-marker px-1 font-mono text-[10px] font-semibold leading-none",
                  "text-[#1a1206]",
                )}
              >
                {unread}
              </motion.span>
            )}
          </AnimatePresence>
        </>
      }
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <span className="eyebrow">Notifications</span>
        <button
          type="button"
          onClick={() =>
            setNotes((current) =>
              current.map((note) => ({ ...note, unread: false })),
            )
          }
          disabled={unread === 0}
          className={cn(
            "rounded text-xs font-medium text-ink-2 transition-colors",
            "hover:text-ink disabled:pointer-events-none disabled:opacity-40",
          )}
        >
          Mark all read
        </button>
      </div>

      <ul className="max-h-80 overflow-y-auto py-1">
        {notes.map((note) => (
          <li key={note.id}>
            <button
              type="button"
              onClick={() =>
                setNotes((current) =>
                  current.map((item) =>
                    item.id === note.id ? { ...item, unread: false } : item,
                  ),
                )
              }
              className={cn(
                "flex w-full gap-2.5 px-3 py-2.5 text-left transition-colors",
                "hover:bg-surface-2",
              )}
            >
              {/* The amber marker means the same thing everywhere: this one. */}
              <span
                className={cn(
                  "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                  note.unread ? "bg-marker" : "bg-transparent",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span
                    className={cn(
                      "truncate text-sm",
                      note.unread
                        ? "font-medium text-ink"
                        : "font-normal text-ink-2",
                    )}
                  >
                    {note.title}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted">
                    {note.at}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">
                  {note.detail}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Dropdown>
  );
}
