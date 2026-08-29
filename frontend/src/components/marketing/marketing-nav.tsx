"use client";

import { motion, useMotionValueEvent, useScroll, useSpring } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { Brand } from "../brand";
import { ThemeToggle } from "../theme-toggle";
import { ButtonLink } from "../ui/button";
import { useSession } from "../session-provider";
import { APP_HOME } from "../../lib/nav";
import { cn } from "../../lib/utils";

const SECTIONS = [
  { href: "#how", label: "How it works" },
  { href: "#capabilities", label: "Capabilities" },
  { href: "#schema", label: "Schema" },
];

/**
 * Transparent over the hero, then it lands: border, surface and lift appear
 * together the moment the page starts to scroll. A hairline reading scroll
 * progress sits along its bottom edge.
 */
export function MarketingNav() {
  const { scrollY, scrollYProgress } = useScroll();
  const [landed, setLanded] = useState(false);

  const progress = useSpring(scrollYProgress, {
    stiffness: 180,
    damping: 30,
    restDelta: 0.001,
  });

  useMotionValueEvent(scrollY, "change", (value) => {
    setLanded(value > 12);
  });

  const { session, ready } = useSession();
  const signedIn = ready && session !== null;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-300 ease-out",
        landed
          ? "border-b border-line bg-surface/80 backdrop-blur-xl [box-shadow:var(--elev-1)]"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Brand href="/" />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Sections">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm text-ink-2",
                "transition-colors hover:bg-surface-2 hover:text-ink",
              )}
            >
              {section.label}
            </Link>
          ))}
        </nav>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <ThemeToggle />

          {signedIn ? (
            <ButtonLink href={APP_HOME} size="sm">
              Open workspace
            </ButtonLink>
          ) : (
            <>
              <ButtonLink
                href="/login"
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex"
              >
                Sign in
              </ButtonLink>
              <ButtonLink href="/signup" size="sm">
                Get started
              </ButtonLink>
            </>
          )}
        </div>
      </div>

      <motion.div
        aria-hidden
        style={{ scaleX: progress }}
        className={cn(
          "h-px origin-left bg-marker transition-opacity duration-300",
          landed ? "opacity-100" : "opacity-0",
        )}
      />
    </header>
  );
}
