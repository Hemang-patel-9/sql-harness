"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CornerDownRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SqlBlock } from "./sql-block";
import { ease } from "../lib/motion";
import { cn } from "../lib/utils";

export interface Pair {
  question: string;
  sql: string;
}

export const PAIRS: Pair[] = [
  {
    question: "Which customers spent the most last quarter?",
    sql: "SELECT c.email, sum(o.total_cents) / 100 AS spend\nFROM orders o\nJOIN customers c ON c.id = o.customer_id\nWHERE o.placed_at >= date_trunc('quarter', now())\n                     - INTERVAL '3 months'\nGROUP BY c.email\nORDER BY spend DESC\nLIMIT 10;",
  },
  {
    question: "How many signups came from each channel this month?",
    sql: "SELECT channel, count(*) AS signups\nFROM customers\nWHERE created_at >= date_trunc('month', now())\nGROUP BY channel\nORDER BY signups DESC;",
  },
  {
    question: "Which tickets have been open longer than two days?",
    sql: "SELECT id, customer_id, opened_at\nFROM tickets\nWHERE status = 'open'\n  AND opened_at < now() - INTERVAL '48 hours'\nORDER BY opened_at;",
  },
];

const TYPE_MS = 32;
const REVEAL_DELAY_MS = 420;
const HOLD_MS = 4600;

/**
 * The one orchestrated moment in the product: a question in plain prose
 * becoming a query. Prose is set in the sans face and the result in mono —
 * the type pairing is the argument.
 *
 * Used by the landing page and by the panel beside the sign-in form.
 */
export function TranscriptCycle({
  className,
  questionClassName = "text-xl",
  sqlMinHeight = "min-h-[13rem]",
}: {
  className?: string;
  questionClassName?: string;
  sqlMinHeight?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  const [index, setIndex] = useState(0);

  // Stable, so the typing effect below is never restarted by a re-render.
  const next = useCallback(
    () => setIndex((current) => (current + 1) % PAIRS.length),
    [],
  );

  return (
    <div className={className}>
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col gap-6"
        >
          <Transcript
            pair={PAIRS[index]}
            reduced={reduced}
            onDone={next}
            questionClassName={questionClassName}
            sqlMinHeight={sqlMinHeight}
          />
        </motion.div>
      </AnimatePresence>

      <ol className="mt-6 flex items-center gap-1.5" aria-hidden>
        {PAIRS.map((pair, i) => (
          <li
            key={pair.question}
            className={cn(
              "h-[3px] rounded-full transition-all duration-300",
              i === index ? "w-7 bg-marker" : "w-3 bg-line-strong",
            )}
          />
        ))}
      </ol>
    </div>
  );
}

/**
 * Remounted per pair (keyed by the parent), so its state starts fresh and
 * every update happens inside a timer callback rather than during an effect.
 */
function Transcript({
  pair,
  reduced,
  onDone,
  questionClassName,
  sqlMinHeight,
}: {
  pair: Pair;
  reduced: boolean;
  onDone: () => void;
  questionClassName: string;
  sqlMinHeight: string;
}) {
  const [typed, setTyped] = useState(() => (reduced ? pair.question : ""));
  const [showSql, setShowSql] = useState(() => reduced);

  useEffect(() => {
    if (reduced) {
      const hold = window.setTimeout(onDone, HOLD_MS * 2);
      return () => window.clearTimeout(hold);
    }

    const timeouts: number[] = [];
    let count = 0;

    const interval = window.setInterval(() => {
      count += 1;
      setTyped(pair.question.slice(0, count));

      if (count >= pair.question.length) {
        window.clearInterval(interval);
        timeouts.push(window.setTimeout(() => setShowSql(true), REVEAL_DELAY_MS));
        timeouts.push(window.setTimeout(onDone, HOLD_MS));
      }
    }, TYPE_MS);

    return () => {
      window.clearInterval(interval);
      timeouts.forEach(window.clearTimeout);
    };
  }, [pair.question, reduced, onDone]);

  return (
    <>
      <p
        className={cn(
          "min-h-[3.5rem] max-w-md leading-snug text-ink",
          questionClassName,
        )}
      >
        {typed}
        <span
          aria-hidden
          className="caret-blink ml-0.5 inline-block h-5 w-[3px] translate-y-0.5 rounded-[1px] bg-marker"
        />
      </p>

      <div className="flex items-center gap-2">
        <CornerDownRight className="h-4 w-4 text-muted" aria-hidden />
        <span className="eyebrow">Becomes</span>
      </div>

      <div className={cn("max-w-2xl", sqlMinHeight)}>
        {showSql && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={ease}
            className="panel-raised overflow-hidden rounded-xl"
          >
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              <span className="eyebrow">Generated SQL</span>
              <span className="flex-1" />
              <span className="font-mono text-[11px] text-muted">postgres</span>
            </div>
            <SqlBlock sql={pair.sql} />
          </motion.div>
        )}
      </div>
    </>
  );
}
