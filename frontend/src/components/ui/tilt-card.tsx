"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { cn } from "../../lib/utils";

const MAX_TILT = 7; // degrees — past ~8 the text starts to smear

/**
 * A card that leans towards the pointer. The lean is real 3D rotation on a
 * shared perspective (`.stage` supplies it), not a fake shear, so the layers
 * inside — anything with a `translateZ` — separate as it moves.
 *
 * Pointer-only: it never fires on touch, and reduced motion opts out
 * entirely, leaving a plain card.
 */
export function TiltCard({
  className,
  children,
  intensity = 1,
}: {
  className?: string;
  children: ReactNode;
  /** Scales the lean. 0.5 for large surfaces, 1.5 for small ones. */
  intensity?: number;
}) {
  const reduced = useReducedMotion();

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);

  const config = { stiffness: 260, damping: 26, mass: 0.6 };
  const rotateX = useSpring(
    useTransform(py, [0, 1], [MAX_TILT * intensity, -MAX_TILT * intensity]),
    config,
  );
  const rotateY = useSpring(
    useTransform(px, [0, 1], [-MAX_TILT * intensity, MAX_TILT * intensity]),
    config,
  );

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    px.set((event.clientX - rect.left) / rect.width);
    py.set((event.clientY - rect.top) / rect.height);
  }

  function reset() {
    px.set(0.5);
    py.set(0.5);
  }

  if (reduced) {
    return <div className={cn("preserve-3d", className)}>{children}</div>;
  }

  return (
    <motion.div
      onPointerMove={handlePointerMove}
      onPointerLeave={reset}
      style={{ rotateX, rotateY }}
      className={cn("preserve-3d", className)}
    >
      {children}
    </motion.div>
  );
}

/**
 * A layer inside a `TiltCard` that stands off the card's own plane.
 * Use sparingly — one or two per card, or the effect reads as noise.
 */
export function TiltLayer({
  depth = 24,
  className,
  children,
}: {
  depth?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{ transform: `translateZ(${depth}px)` }}
      className={cn("preserve-3d", className)}
    >
      {children}
    </div>
  );
}
