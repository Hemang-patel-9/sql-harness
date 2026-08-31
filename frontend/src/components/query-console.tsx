"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  CornerDownLeft,
  Database,
  Loader2,
  Plug,
  Sparkles,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RetrievalCard } from "./retrieval-card";
import { UnderstandingCard } from "./understanding-card";
import { Button, ButtonLink } from "./ui/button";
import { Dropdown, DropdownItem } from "./ui/dropdown";
import { engineIcon } from "./ui/engine-select";
import { EmptyState, Panel, PanelHeader } from "./ui/page-shell";
import { ApiError, generateSql, listConnections } from "../lib/api";
import type { Connection, QueryResponse } from "../lib/api";
import { ease } from "../lib/motion";
import { useIsMounted } from "../lib/store";
import { cn } from "../lib/utils";

const EXAMPLES = [
  "Top 10 customers by lifetime value",
  "Orders that were refunded last month",
  "Daily signups for the past 30 days",
];

/** Starts empty on purpose: defaulting to whichever connection sorts first
 *  would answer the page's first real decision for you. */
function DatabasePicker({
  connections,
  selected,
  onSelect,
}: {
  connections: Connection[];
  selected: Connection | null;
  onSelect: (id: string) => void;
}) {
  const selectedEngine = selected ? engineIcon(selected.engine) : null;

  return (
    <Dropdown
      trigger={
        <span className="flex items-center gap-2">
          {selectedEngine ? (
            <selectedEngine.icon
              className="h-4 w-4 shrink-0"
              style={{ color: selectedEngine.color }}
              aria-hidden
            />
          ) : (
            <Database className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          )}
          <span
            className={cn(
              "max-w-[11rem] truncate text-[13px] font-medium",
              selected ? "text-ink" : "text-muted",
            )}
          >
            {selected?.label ?? "Choose a database"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
        </span>
      }
      triggerLabel={
        selected ? `Database: ${selected.label}. Choose another` : "Choose a database"
      }
      variant="field"
      triggerClassName="w-auto gap-2"
      panelClassName="w-72"
    >
      {connections.map((connection) => {
        const engine = engineIcon(connection.engine);
        return (
          <DropdownItem
            key={connection.id}
            icon={engine.icon}
            onSelect={() => onSelect(connection.id)}
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{connection.label}</span>
              <span className="truncate font-mono text-[11px] text-muted">
                {connection.host}:{connection.port}/{connection.databaseName}
              </span>
            </span>
            {connection.id === selected?.id && (
              <Check className="h-4 w-4 shrink-0 text-marker" aria-hidden />
            )}
          </DropdownItem>
        );
      })}
    </Dropdown>
  );
}

export function QueryConsole() {
  /** Only connections that passed "fire demo query" — the server rejects the rest. */
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Name the key the reader actually has on their keyboard.
  const mounted = useIsMounted();
  const modifier =
    mounted && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";

  useEffect(() => {
    let cancelled = false;
    listConnections()
      .then((all) => {
        if (!cancelled) setConnections(all.filter((c) => c.status === "connected"));
      })
      .catch((err) => {
        if (cancelled) return;
        setConnections([]);
        setLoadError(
          err instanceof ApiError ? err.message : "Could not load your databases.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = connections?.find((c) => c.id === selectedId) ?? null;
  const canRun = selected !== null && question.trim().length > 0 && !loading;

  function selectConnection(id: string) {
    if (id === selectedId) return;
    setSelectedId(id);
    // An answer from the previous database would read as this one's.
    setResult(null);
    setError(null);
  }

  async function run(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading || !selectedId) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      setResult(await generateSql(selectedId, trimmed));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "The request failed before it reached the server.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (connections === null) {
    return (
      <div className="flex flex-col gap-5">
        <div className="panel-raised h-[8.5rem] animate-pulse rounded-xl" />
        <div className="h-7 w-64 animate-pulse rounded-full bg-surface-2" />
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {loadError && <p className="text-sm text-danger">{loadError}</p>}
        <EmptyState
          icon={Plug}
          title="No connected databases"
          description="Add a connection and fire a successful demo query on the Connections page. Only databases that answered are offered here."
          action={
            <ButtonLink href="/connections" size="sm" variant="secondary">
              Go to Connections
            </ButtonLink>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* No `overflow-hidden` here: it would clip the database menu. The
          caret gets its own clipping layer below instead. */}
      <div
        className={cn(
          "panel-raised relative rounded-xl",
          "transition-[border-color,box-shadow] duration-200",
          focused && "border-line-strong [box-shadow:var(--elev-inset),var(--elev-2)]",
        )}
      >
        {/* Marks the field you are typing into, as it marks the active tab. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
        >
          <span
            className={cn(
              "absolute left-0 top-0 w-[3px] rounded-r-[1px] bg-marker",
              "transition-all duration-300 ease-out",
              focused ? "h-full opacity-100" : "h-0 opacity-0",
            )}
          />
        </span>

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
            maxLength={2000}
            placeholder={
              selected
                ? `Ask ${selected.label} a question…`
                : "Which customers spent the most last quarter?"
            }
            aria-label="Your question"
            className={cn(
              "relative w-full resize-y bg-transparent px-4 pt-4 text-[15px] leading-relaxed",
              "text-ink outline-none placeholder:text-muted",
            )}
          />

          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-b-xl",
              "border-t border-line bg-surface-2/40 px-4 py-2.5",
            )}
          >
            {selected ? (
              <p className="flex items-center gap-1 font-mono text-[11px] text-muted">
                <Kbd>{modifier}</Kbd>
                <span className="text-line-strong">+</span>
                <Kbd>
                  <CornerDownLeft className="h-3 w-3" />
                </Kbd>
                <span className="ml-1.5">to run</span>
              </p>
            ) : (
              <p className="text-[11px] text-muted">Pick a database before you ask.</p>
            )}

            <div className="ml-auto flex items-center gap-2">
              <DatabasePicker
                connections={connections}
                selected={selected}
                onSelect={selectConnection}
              />
              {/* h-9 to sit level with the picker's field-height trigger. */}
              <Button type="submit" size="sm" className="h-9" disabled={!canRun}>
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {loading ? "Translating" : "Generate SQL"}
              </Button>
            </div>
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
              // Nothing to run it against yet, so it only fills the field.
              if (selectedId) void run(example);
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
                <span className="eyebrow">Reading the question, then searching</span>
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
              <span className="block font-medium text-ink">The query did not run.</span>
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
            <div className="flex flex-col gap-4">
              <UnderstandingCard
                understanding={result.understanding}
                connectionLabel={result.connectionLabel}
              />
              <RetrievalCard retrieval={result.retrieval} />
            </div>
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
