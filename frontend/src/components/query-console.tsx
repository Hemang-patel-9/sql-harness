"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, CircleAlert, Copy, Loader2, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { SqlBlock } from "./sql-block";
import { Panel, PanelHeader } from "./ui/page-shell";
import { generateSql, type QueryResponse } from "../lib/api";
import { ease } from "../lib/motion";
import { useIsMounted } from "../lib/store";
import { cn } from "../lib/utils";

const EXAMPLES = [
  "Top 10 customers by lifetime value",
  "Orders that were refunded last month",
  "Daily signups for the past 30 days",
];

export function QueryConsole() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Name the key the reader actually has on their keyboard.
  const mounted = useIsMounted();
  const modifier =
    mounted && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";

  async function run(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      setResult(await generateSql(trimmed));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "The request failed before it reached the server.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function copySql() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.sql);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Your browser blocked the clipboard. Select the SQL and copy it.");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Panel>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(question);
          }}
        >
          <textarea
            ref={inputRef}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void run(question);
              }
            }}
            rows={3}
            placeholder="Which customers spent the most last quarter?"
            aria-label="Your question"
            className={cn(
              "w-full resize-y bg-transparent px-4 pt-4 text-[15px] leading-relaxed",
              "text-ink outline-none placeholder:text-muted",
            )}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3.5 pt-2">
            <p className="font-mono text-[11px] text-muted">
              <kbd className="rounded border border-line px-1 py-0.5">
                {modifier}
              </kbd>
              <span className="mx-1">+</span>
              <kbd className="rounded border border-line px-1 py-0.5">
                Enter
              </kbd>
              <span className="ml-2">to run</span>
            </p>

            <button
              type="submit"
              disabled={loading || question.trim().length === 0}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg bg-ink px-3.5",
                "text-sm font-medium text-paper transition-[opacity,transform] duration-150",
                "hover:opacity-90 active:scale-[0.97]",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {loading ? "Translating" : "Generate SQL"}
            </button>
          </div>
        </form>
      </Panel>

      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow mr-1">Try</span>
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => {
              setQuestion(example);
              inputRef.current?.focus();
              void run(example);
            }}
            className={cn(
              "rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-2",
              "transition-colors hover:border-line-strong hover:text-ink",
            )}
          >
            {example}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={ease}
            role="alert"
            className={cn(
              "flex items-start gap-2.5 rounded-xl border border-line bg-surface p-4",
              "text-sm text-ink-2",
            )}
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <span>
              <span className="block font-medium text-ink">
                The query did not run.
              </span>
              <span className="mt-0.5 block break-words text-muted">
                {error}
              </span>
              <span className="mt-1.5 block text-muted">
                Check that the API is running on{" "}
                <code className="font-mono">localhost:8000</code>, then try
                again.
              </span>
            </span>
          </motion.div>
        )}

        {result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={ease}
          >
            <Panel>
              <PanelHeader>
                <span className="eyebrow">Generated SQL</span>
                <button
                  type="button"
                  onClick={() => void copySql()}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs",
                    "text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </button>
              </PanelHeader>

              <SqlBlock sql={result.sql} />

              <p className="border-t border-line px-4 py-2.5 text-xs text-muted">
                {result.note}
              </p>
            </Panel>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
