"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ArrowRight, ChevronDown } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef } from "react";
import { ButtonLink } from "../ui/button";
import { useSession } from "../session-provider";
import { APP_HOME } from "../../lib/nav";
import { easeLong, stagger } from "../../lib/motion";

/**
 * WebGL is decorative here, so it never reaches the server and never sits in
 * the critical path — the headline and the buttons are readable and usable
 * whether or not the canvas ever arrives.
 */
const QueryEngine = dynamic(() => import("../three/query-engine"), {
  ssr: false,
  loading: () => <div className="h-full w-full" />,
});

const ENGINES = ["PostgreSQL", "MySQL", "SQLite"];

const rise = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: easeLong },
};

export function Hero() {
  const section = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: section,
    offset: ["start start", "end start"],
  });

  // The object drifts up and fades as you leave the hero; the copy stays put.
  const sceneY = useTransform(scrollYProgress, [0, 1], [0, reduced ? 0 : -70]);
  const sceneOpacity = useTransform(scrollYProgress, [0, 0.85], [1, reduced ? 1 : 0.15]);

  const { session, ready } = useSession();
  const signedIn = ready && session !== null;

  return (
    <section
      ref={section}
      className="dot-field relative overflow-hidden border-b border-line"
    >
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-6 lg:px-8 lg:pb-28 lg:pt-20">
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="relative z-10 max-w-xl"
        >
          <motion.p variants={rise} className="eyebrow eyebrow-tick">
            Natural language → SQL
          </motion.p>

          <motion.h1
            variants={rise}
            className="mt-5 text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.03em] text-ink sm:text-6xl"
          >
            Ask your database a question.
          </motion.h1>

          <motion.p
            variants={rise}
            className="mt-5 max-w-lg text-[17px] leading-relaxed text-ink-2"
          >
            SQL Harness reads your schema, turns the question into a query, and
            hands it back for you to read — before a single row is touched.
          </motion.p>

          <motion.div variants={rise} className="mt-8 flex flex-wrap items-center gap-3">
            {signedIn ? (
              <ButtonLink href={APP_HOME} size="lg" className="group">
                Open workspace
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </ButtonLink>
            ) : (
              <ButtonLink href="/signup" size="lg" className="group">
                Start free
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </ButtonLink>
            )}
            <ButtonLink href="#how" variant="secondary" size="lg">
              See how it works
            </ButtonLink>
          </motion.div>

          <motion.div
            variants={rise}
            className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-2"
          >
            <span className="eyebrow">Speaks</span>
            {ENGINES.map((engine) => (
              <span
                key={engine}
                className="panel rounded-full px-3 py-1 font-mono text-[11px] text-ink-2"
              >
                {engine}
              </span>
            ))}
            <span className="font-mono text-[11px] text-muted">
              read-only by default
            </span>
          </motion.div>
        </motion.div>

        {/* The schema, as an object. */}
        <motion.div
          style={{ y: sceneY, opacity: sceneOpacity }}
          className="relative h-[340px] w-full sm:h-[440px] lg:h-[560px]"
        >
          <QueryEngine className="absolute inset-0" />
        </motion.div>
      </div>

      <a
        href="#how"
        className="group absolute bottom-5 left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 text-muted transition-colors hover:text-ink lg:flex"
      >
        <span className="eyebrow">Keep reading</span>
        <ChevronDown className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-y-0.5" />
      </a>
    </section>
  );
}
