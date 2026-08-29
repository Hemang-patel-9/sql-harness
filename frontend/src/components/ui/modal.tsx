"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Modal({
  open,
  onClose,
  title,
  children,
  panelClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  panelClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            aria-hidden
            className="absolute inset-0 bg-ink/35 backdrop-blur-[3px]"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.15 }}
            className={cn(
              "panel-float relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl",
              panelClassName,
            )}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/95 px-5 py-3.5 backdrop-blur-sm">
              <h2 className="text-sm font-semibold text-ink">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
