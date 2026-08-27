"use client";

import { forwardRef } from "react";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/utils";

type IconButtonProps = ComponentPropsWithoutRef<"button"> & {
  /** Always required — these buttons are icon-only. */
  label: string;
};

/**
 * Icon-only control used across the navbar and sidebar. Quiet by default,
 * with a neutral surface on hover — the amber signal is reserved for state,
 * never for hover.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ label, className, children, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        className={cn(
          "relative grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-2",
          "transition-[background-color,color,transform] duration-150",
          "hover:bg-surface-2 hover:text-ink active:scale-90",
          "disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
