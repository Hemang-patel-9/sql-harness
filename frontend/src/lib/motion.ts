import type { Transition, Variants } from "motion/react";

/** One spring, used everywhere something moves between two places. */
export const spring: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 36,
  mass: 0.8,
};

/** Softer spring for larger surfaces (sidebar width, drawers). */
export const springSoft: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 34,
  mass: 0.9,
};

export const ease: Transition = { duration: 0.22, ease: [0.22, 1, 0.36, 1] };

/** Menus and popovers: scale from their own corner. */
export const popover: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: -6 },
  visible: { opacity: 1, scale: 1, y: 0, transition: ease },
  exit: { opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.12 } },
};

/** Page content: a short, staggered settle on mount. */
export const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

export const riseItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: ease },
};
