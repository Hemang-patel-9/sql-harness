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

/** Longer version of the same curve, for entrances that travel further. */
export const easeLong: Transition = {
  duration: 0.62,
  ease: [0.22, 1, 0.36, 1],
};

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

/* ------------------------------------------------------------------ */
/* Scroll                                                              */
/* ------------------------------------------------------------------ */

/**
 * One viewport rule for every scroll reveal, so nothing on the page
 * animates twice and everything triggers at the same depth.
 */
export const viewportOnce = { once: true, amount: 0.35, margin: "0px 0px -12% 0px" } as const;

/** A section arriving from below as it scrolls into view. */
export const revealSection: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: easeLong },
};

/** Children of a revealed section, dealt out one after another. */
export const revealStagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.06 } },
};

export const revealItem: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: easeLong },
};

/**
 * A card arriving with a little depth — it rotates flat as it settles.
 * Only for the few places that sit on the 3D stage.
 */
export const revealCard: Variants = {
  hidden: { opacity: 0, y: 26, rotateX: 8 },
  visible: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
  },
};
