import Link from "next/link";
import { cn } from "../lib/utils";

/**
 * The wordmark. The amber block before it is a text caret — the same mark
 * that tracks the active tab in the sidebar, so "you are here" reads the
 * same way at every scale. It stretches a little when you point at it.
 */
export function Brand({
  href = "/",
  className,
  caretClassName,
}: {
  href?: string;
  className?: string;
  caretClassName?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-2 rounded font-mono text-[15px] font-semibold",
        "tracking-tight text-ink",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "h-4 w-[3px] origin-center rounded-[1px] bg-marker",
          "transition-transform duration-300 ease-out group-hover:scale-y-125",
          caretClassName,
        )}
      />
      SQL Harness
    </Link>
  );
}
