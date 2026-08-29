"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, CircleAlert, Copy, CornerDownLeft, Loader2, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { SqlBlock } from "./sql-block";
import { Button } from "./ui/button";
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
  const [focused, setFocused] = useState(false);
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
      {/* Composer ---------------------------------------------------- */}
      <div
        className={cn(
          "panel-raised relative overflow-hidden rounded-xl",
          "transition-[border-color,box-shadow] duration-200",
          focused && "border-line-strong [box-shadow:var(--elev-inset),var(--elev-2)]",
        )}
      >
        {/* The amber caret marks the field you are typing into, the same
            way it marks the active tab. */}
        <span
          aria-hidden
          className={cn(
            "absolute left-0 top-0 w-[3px] rounded-r-[1px] bg-marker",
            "transition-all duration-300 ease-out",
            focused ? "h-full opacity-100" : "h-0 opacity-0",
          )}
        />

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
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
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

          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 border-t border-line",
              "bg-surface-2/40 px-4 py-2.5",
            )}
          >
            <p className="flex items-center gap-1 font-mono text-[11px] text-muted">
              <Kbd>{modifier}</Kbd>
              <span className="text-line-strong">+</span>
              <Kbd>
                <CornerDownLeft className="h-3 w-3" />
              </Kbd>
              <span className="ml-1.5">to run</span>
            </p>

            <Button
              type="submit"
              size="sm"
              disabled={loading || question.trim().length === 0}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {loading ? "Translating" : "Generate SQL"}
            </Button>
          </div>
        </form>
      </div>

      {/* Examples ---------------------------------------------------- */}
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
              "panel rounded-full px-3 py-1.5 text-xs text-ink-2",
              "transition-[transform,box-shadow,color,border-color] duration-200 ease-out",
              "hover:-translate-y-px hover:border-line-strong hover:text-ink",
              "hover:[box-shadow:var(--elev-inset),var(--elev-2)]",
              "active:translate-y-0",
            )}
          >
            {example}
          </button>
        ))}
      </div>

      {/* Output ------------------------------------------------------ */}
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            key="pending"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={ease}
          >
            <Panel>
              <PanelHeader>
                <span className="eyebrow">Reading the schema</span>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
              </PanelHeader>
              <div className="flex flex-col gap-2.5 p-4">
                {[92, 74, 58, 81, 40].map((width, index) => (
                  <motion.span
                    key={width}
                    aria-hidden
                    initial={{ opacity: 0.35 }}
                    animate={{ opacity: [0.35, 0.75, 0.35] }}
                    transition={{
                      duration: 1.4,
                      repeat: Infinity,
                      delay: index * 0.12,
                      ease: "easeInOut",
                    }}
                    style={{ width: `${width}%` }}
                    className="h-2.5 rounded-sm bg-surface-2"
                  />
                ))}
              </div>
            </Panel>
          </motion.div>
        )}

        {error && !loading && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={ease}
            role="alert"
            className="panel flex items-start gap-2.5 rounded-xl p-4 text-sm text-ink-2"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <span>
              <span className="block font-medium text-ink">
                The query did not run.
              </span>
              <span className="mt-0.5 block break-words text-muted">{error}</span>
              <span className="mt-1.5 block text-muted">
                Check that the API is running on{" "}
                <code className="font-mono">localhost:8000</code>, then try again.
              </span>
            </span>
          </motion.div>
        )}

        {result && !loading && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={ease}
          >
            <Panel raised>
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

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-line",
        "bg-surface px-1 font-mono text-[10px] text-ink-2",
        "[box-shadow:inset_0_-1px_0_var(--line)]",
      )}
    >
      {children}
    </kbd>
  );
}
