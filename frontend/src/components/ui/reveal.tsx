"use client";

import { motion, useReducedMotion } from "motion/react";
import type { Variants } from "motion/react";
import type { ReactNode } from "react";
import {
  revealItem,
  revealSection,
  revealStagger,
  viewportOnce,
} from "../../lib/motion";

/**
 * The elements a reveal is ever asked to be. They are looked up rather than
 * built per render — `motion.create(tag)` inside a render would hand React a
 * new component type each time and remount everything inside it.
 */
const TAGS = {
  div: motion.div,
  p: motion.p,
  h2: motion.h2,
  h3: motion.h3,
  ul: motion.ul,
  li: motion.li,
  span: motion.span,
  article: motion.article,
  section: motion.section,
} as const;

type Tag = keyof typeof TAGS;

/**
 * A block that settles into place the first time it scrolls into view.
 *
 * `Reveal` and `RevealItem` are a pair: the parent owns the trigger and the
 * stagger, the children only declare how they arrive. Under
 * `prefers-reduced-motion` both render their final state directly, so the
 * page is never left waiting on an animation that will not run.
 */
export function Reveal({
  as = "div",
  stagger = false,
  delay = 0,
  className,
  children,
}: {
  as?: Tag;
  /** Deal children out one after another — pair with `RevealItem`. */
  stagger?: boolean;
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const Component = TAGS[as];

  if (reduced) return <Component className={className}>{children}</Component>;

  return (
    <Component
      variants={withDelay(stagger ? revealStagger : revealSection, delay)}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      className={className}
    >
      {children}
    </Component>
  );
}

export function RevealItem({
  as = "div",
  variants = revealItem,
  className,
  children,
}: {
  as?: Tag;
  variants?: Variants;
  className?: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const Component = TAGS[as];

  if (reduced) return <Component className={className}>{children}</Component>;

  return (
    <Component variants={variants} className={className}>
      {children}
    </Component>
  );
}

function withDelay(variants: Variants, delay: number): Variants {
  if (!delay) return variants;
  const visible = variants.visible;
  if (typeof visible !== "object" || visible === null) return variants;

  const transition = (visible as { transition?: object }).transition ?? {};
  return {
    ...variants,
    visible: { ...visible, transition: { ...transition, delay } },
  };
}
