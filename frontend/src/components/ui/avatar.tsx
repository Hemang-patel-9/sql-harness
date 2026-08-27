"use client";

import { cn } from "../../lib/utils";
import { initials } from "../../lib/utils";

/**
 * Demo avatar. No image upload yet — initials on ink, set in the mono face so
 * it reads as an identifier rather than a word.
 */
export function Avatar({
  name,
  size = 28,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-ink font-mono font-medium",
        "leading-none tracking-tight text-paper select-none",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
