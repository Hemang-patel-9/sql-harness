"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { riseItem, stagger } from "../../lib/motion";
import { cn } from "../../lib/utils";

/**
 * Every page opens the same way: a true fact about the page in the mono
 * utility face, the page name, then one line saying what you can do here.
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
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="visible"
      className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-6 lg:px-8 lg:py-10"
    >
      <motion.header
        variants={riseItem}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div className="min-w-0">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-2.5 text-2xl font-semibold tracking-tight text-ink sm:text-[28px] sm:leading-9">
            {title}
          </h1>
          <p className="mt-1.5 max-w-prose text-sm text-muted">{description}</p>
        </div>
        {actions}
      </motion.header>

      <motion.div variants={riseItem} className="mt-7 sm:mt-8">
        {children}
      </motion.div>
    </motion.div>
  );
}

export function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-line bg-surface",
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
        "flex items-center justify-between gap-3 border-b border-line px-4 py-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
