"use client";

import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { riseItem, stagger } from "../../lib/motion";
import { cn } from "../../lib/utils";

/**
 * Every page opens the same way: a true fact about the page in the mono
 * utility face, the page name, then one line saying what you can do here.
 * The header sits on the dotted ground and is separated from the work by a
 * hairline, so the page has a masthead rather than just a first paragraph.
 */
export function PageShell({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.div variants={stagger} initial="hidden" animate="visible">
      <div className="dot-field border-b border-line">
        <motion.header
          variants={riseItem}
          className="mx-auto flex w-full max-w-5xl flex-wrap items-end justify-between gap-4 px-4 pb-8 pt-8 sm:px-6 lg:px-8 lg:pb-10 lg:pt-11"
        >
          <div className="min-w-0">
            <p className="eyebrow eyebrow-tick">{eyebrow}</p>
            <h1 className="mt-3.5 text-[27px] font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-[32px]">
              {title}
            </h1>
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
              {description}
            </p>
          </div>
          {actions}
        </motion.header>
      </div>

      <motion.div
        variants={riseItem}
        className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6 lg:px-8 lg:py-9"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export function Panel({
  className,
  raised = false,
  children,
}: {
  className?: string;
  /** For the one panel on a page that carries the work. */
  raised?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        raised ? "panel-raised" : "panel",
        "overflow-hidden rounded-xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-line",
        "bg-surface-2/50 px-4 py-2.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Shown in place of a panel/list when there is no data to show yet. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "dot-field dot-field-flat flex flex-col items-center gap-3 rounded-xl",
        "border border-dashed border-line-strong px-6 py-16 text-center",
      )}
    >
      <span
        className={cn(
          "grid h-12 w-12 place-items-center rounded-xl border border-line",
          "bg-surface text-muted [box-shadow:var(--elev-inset),var(--elev-1)]",
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{description}</p>
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
