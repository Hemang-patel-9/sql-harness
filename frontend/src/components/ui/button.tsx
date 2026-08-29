"use client";

import Link from "next/link";
import { forwardRef } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../../lib/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-3 text-[13px]",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-12 gap-2 px-5 text-[15px]",
};

/**
 * Depth without a gradient: a flat fill, a 1px lit top edge, and a shadow
 * that grows as the control rises to meet the pointer. Pressing it puts the
 * control back down on the page.
 */
const VARIANTS: Record<Variant, string> = {
  primary: cn(
    "bg-ink text-paper",
    "[box-shadow:inset_0_1px_0_rgb(255_255_255_/_0.16),var(--elev-2)]",
    "hover:-translate-y-px hover:[box-shadow:inset_0_1px_0_rgb(255_255_255_/_0.2),var(--elev-3)]",
    "active:translate-y-0 active:[box-shadow:inset_0_1px_0_rgb(255_255_255_/_0.1),var(--elev-1)]",
  ),
  secondary: cn(
    "border border-line bg-surface text-ink",
    "[box-shadow:var(--elev-inset),var(--elev-1)]",
    "hover:-translate-y-px hover:border-line-strong",
    "hover:[box-shadow:var(--elev-inset),var(--elev-2)]",
    "active:translate-y-0 active:[box-shadow:var(--elev-inset),var(--elev-1)]",
  ),
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
};

const BASE = cn(
  "inline-flex shrink-0 select-none items-center justify-center rounded-lg font-medium",
  "transition-[transform,box-shadow,background-color,border-color,color,opacity]",
  "duration-200 ease-out",
  "disabled:pointer-events-none disabled:opacity-40",
);

interface Common {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}

export const Button = forwardRef<
  HTMLButtonElement,
  Common & ComponentPropsWithoutRef<"button">
>(function Button(
  { variant = "primary", size = "md", className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(BASE, SIZES[size], VARIANTS[variant], className)}
      {...props}
    >
      {children}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: Common & { href: string } & Omit<
    ComponentPropsWithoutRef<typeof Link>,
    "href" | "className" | "children"
  >) {
  return (
    <Link
      href={href}
      className={cn(BASE, SIZES[size], VARIANTS[variant], className)}
      {...props}
    >
      {children}
    </Link>
  );
}
