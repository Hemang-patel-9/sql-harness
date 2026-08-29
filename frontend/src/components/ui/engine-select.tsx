"use client";

import { Check, ChevronDown } from "lucide-react";
import { SiMysql, SiPostgresql } from "react-icons/si";
import type { IconType } from "react-icons";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import type { DbEngine } from "../../lib/api";

const ENGINES: { value: DbEngine; label: string; icon: IconType; color: string }[] = [
  { value: "postgresql", label: "PostgreSQL", icon: SiPostgresql, color: "#336791" },
  { value: "mysql", label: "MySQL", icon: SiMysql, color: "#4479A1" },
];

export function engineIcon(engine: DbEngine) {
  return ENGINES.find((e) => e.value === engine)!;
}

/**
 * A form-styled listbox (not a native <select>) so each option can carry the
 * engine's real brand mark instead of plain text.
 */
export function EngineSelect({
  id,
  label,
  value,
  onChange,
  onBlur,
  placeholder = "Select a database engine",
  error,
  disabled,
}: {
  id: string;
  label: string;
  value: DbEngine | "";
  onChange: (value: DbEngine) => void;
  onBlur?: () => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const errorId = useId();
  const selected = ENGINES.find((e) => e.value === value);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        onBlur?.();
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="flex flex-col gap-1.5" ref={rootRef}>
      <label htmlFor={id} className="eyebrow">
        {label}
      </label>

      <div className="relative">
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-describedby={error ? errorId : undefined}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex h-11 w-full items-center gap-2.5 rounded-lg border bg-surface px-3.5 text-sm",
            "outline-none transition-colors disabled:pointer-events-none disabled:opacity-60",
            error
              ? "border-red-500/70 focus-visible:border-red-500"
              : open
                ? "border-line-strong"
                : "border-line hover:border-line-strong",
          )}
        >
          {selected ? (
            <>
              <selected.icon className="h-4 w-4 shrink-0" style={{ color: selected.color }} aria-hidden />
              <span className="text-ink">{selected.label}</span>
            </>
          ) : (
            <span className="text-muted">{placeholder}</span>
          )}
          <ChevronDown
            className={cn("ml-auto h-4 w-4 shrink-0 text-muted transition-transform duration-150", open && "rotate-180")}
          />
        </button>

        {open && (
          <ul
            role="listbox"
            aria-label={label}
            className={cn(
              "absolute left-0 right-0 top-[calc(100%+0.375rem)] z-20 overflow-hidden rounded-lg",
              "border border-line bg-surface py-1",
              "shadow-[0_1px_2px_rgb(16_21_27_/_0.04),0_12px_32px_-8px_rgb(16_21_27_/_0.14)]",
            )}
          >
            {ENGINES.map((engine) => {
              const isSelected = value === engine.value;
              return (
                <li key={engine.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(engine.value);
                      setOpen(false);
                      onBlur?.();
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition-colors",
                      "hover:bg-surface-2",
                      isSelected ? "text-ink" : "text-ink-2",
                    )}
                  >
                    <engine.icon className="h-4 w-4 shrink-0" style={{ color: engine.color }} aria-hidden />
                    {engine.label}
                    {isSelected && <Check className="ml-auto h-4 w-4 text-marker" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error && (
        <p id={errorId} className="text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
