"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { popover } from "../../lib/motion";
import { cn } from "../../lib/utils";

const CloseContext = createContext<() => void>(() => {});

/** Lets any menu item close the dropdown it lives in. */
export function useDropdownClose() {
  return useContext(CloseContext);
}

interface DropdownProps {
  /** Rendered inside the trigger button. */
  trigger: ReactNode;
  triggerLabel: string;
  triggerClassName?: string;
  panelClassName?: string;
  children: ReactNode;
}

export function Dropdown({
  trigger,
  triggerLabel,
  triggerClassName,
  panelClassName,
  children,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "relative grid h-9 shrink-0 place-items-center rounded-lg text-ink-2",
          "transition-[background-color,color,transform] duration-150",
          "hover:bg-surface-2 hover:text-ink active:scale-90",
          open && "bg-surface-2 text-ink",
          triggerClassName ?? "w-9",
        )}
      >
        {trigger}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            role="menu"
            variants={popover}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{ transformOrigin: "top right" }}
            className={cn(
              "panel-float absolute right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden",
              "rounded-xl",
              panelClassName ?? "w-64",
            )}
          >
            <CloseContext.Provider value={close}>
              {children}
            </CloseContext.Provider>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A row inside a dropdown panel. Renders as a button unless `href` is given. */
export function DropdownItem({
  icon: Icon,
  children,
  onSelect,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: ReactNode;
  onSelect?: () => void;
  destructive?: boolean;
}) {
  const close = useDropdownClose();
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onSelect?.();
        close();
      }}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm",
        "transition-colors duration-150 hover:bg-surface-2",
        destructive ? "text-danger" : "text-ink-2 hover:text-ink",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {children}
    </button>
  );
}
