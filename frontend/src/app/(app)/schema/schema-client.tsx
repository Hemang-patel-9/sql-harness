"use client";

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Code2,
  Loader2,
  Plug,
  RefreshCw,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  fetchSchema,
  getSchemaSnapshot,
  listConnections,
} from "../../../lib/api";
import type { Connection, SchemaSnapshot } from "../../../lib/api";
import { Dropdown, DropdownItem } from "../../../components/ui/dropdown";
import { engineIcon } from "../../../components/ui/engine-select";
import { ease } from "../../../lib/motion";
import { Modal } from "../../../components/ui/modal";
import { EmptyState, PageShell } from "../../../components/ui/page-shell";
import { cn } from "../../../lib/utils";
import { SCHEMA_QUERIES, SchemaQueriesPreview } from "./schema-queries";
import { SchemaCanvas } from "./schema-canvas";

function formatRelativeTime(iso: string): string {
  const diffSeconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSeconds < 5) return "just now";
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const minutes = Math.round(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function ConnectionPicker({
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
          {selectedEngine && (
            <selectedEngine.icon
              className="h-4 w-4 shrink-0"
              style={{ color: selectedEngine.color }}
              aria-hidden
            />
          )}
          <span className="max-w-[10rem] truncate text-sm font-medium text-ink">
            {selected?.label ?? "Choose a connection"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
        </span>
      }
      triggerLabel="Choose a connection"
      triggerClassName="w-auto gap-2 rounded-lg border border-line px-3 hover:border-line-strong"
      panelClassName="w-72"
    >
      {connections.map((connection) => {
        const engine = engineIcon(connection.engine);
        return (
          <DropdownItem key={connection.id} icon={engine.icon} onSelect={() => onSelect(connection.id)}>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{connection.label}</span>
              <span className="truncate font-mono text-[11px] text-muted">
                {connection.host}:{connection.port}
              </span>
            </span>
          </DropdownItem>
        );
      })}
    </Dropdown>
  );
}

/** A quiet pulsing block — the shape of what's about to appear, not a spinner. */
function SkeletonBlock({ className, delay = 0 }: { className?: string; delay?: number }) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-surface-2", className)}
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}

function SchemaLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <SkeletonBlock className="h-8 flex-1" />
        <SkeletonBlock className="h-8 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-4 rounded-xl border border-line bg-paper p-6 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-32" delay={i * 70} />
        ))}
      </div>
    </div>
  );
}

export function SchemaClient() {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Keyed by connectionId so a switch to another connection is never shown
  // stale data from the previous one while its own fetch is in flight.
  const [snapshotState, setSnapshotState] = useState<{
    connectionId: string;
    snapshot: SchemaSnapshot | null;
    error: string | null;
  } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showQueries, setShowQueries] = useState(false);
  const [justFetched, setJustFetched] = useState(false);
  const justFetchedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listConnections()
      .then((list) => {
        setConnections(list);
        const connected = list.filter((c) => c.status === "connected");
        if (connected.length > 0) setSelectedId(connected[0].id);
      })
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : "Could not load connections.");
        setConnections([]);
      });
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;

    getSchemaSnapshot(selectedId)
      .then((snap) => {
        if (cancelled) return;
        setSnapshotState({ connectionId: selectedId, snapshot: snap, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setSnapshotState({
          connectionId: selectedId,
          snapshot: null,
          error: err instanceof ApiError ? err.message : "Could not load the schema.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    return () => {
      if (justFetchedTimer.current) clearTimeout(justFetchedTimer.current);
    };
  }, []);

  async function runFetch() {
    if (!selectedId) return;
    setConfirmOpen(false);
    setFetching(true);
    setFetchError(null);
    try {
      const result = await fetchSchema(selectedId);
      if (result.ok && result.snapshot) {
        setSnapshotState({ connectionId: selectedId, snapshot: result.snapshot, error: null });
        setJustFetched(true);
        if (justFetchedTimer.current) clearTimeout(justFetchedTimer.current);
        justFetchedTimer.current = setTimeout(() => setJustFetched(false), 2600);
      } else {
        setFetchError(result.detail);
      }
    } catch (err) {
      setFetchError(err instanceof ApiError ? err.message : "Could not fetch the schema.");
    } finally {
      setFetching(false);
    }
  }

  const connectedConnections = connections?.filter((c) => c.status === "connected") ?? [];
  const selectedConnection = connectedConnections.find((c) => c.id === selectedId) ?? null;
  const isCurrent = snapshotState?.connectionId === selectedId;
  const snapshotChecked = isCurrent;
  const snapshot = isCurrent ? snapshotState.snapshot : null;
  const snapshotLoadError = isCurrent ? snapshotState.error : null;
  const displayError = fetchError ?? snapshotLoadError;
  const relationshipCount = snapshot
    ? snapshot.tables.reduce((n, t) => n + t.foreignKeys.length, 0)
    : 0;

  return (
    <PageShell
      eyebrow={
        snapshot
          ? `${snapshot.tableCount} tables · ${snapshot.columnCount} columns · ${relationshipCount} relationships`
          : connections === null
            ? "Loading…"
            : `${connectedConnections.length} connected database${connectedConnections.length === 1 ? "" : "s"}`
      }
      title="Schema"
      description="Fetch the live tables, columns, relationships and indexes so queries can be written against what your database actually looks like."
      actions={
        connectedConnections.length > 0 && (
          <div className="flex items-center gap-2">
            <ConnectionPicker
              connections={connectedConnections}
              selected={selectedConnection}
              onSelect={setSelectedId}
            />
            <button
              type="button"
              disabled={!selectedId || fetching}
              onClick={() => setConfirmOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-sm font-medium text-paper transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
            >
              {fetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {snapshot ? "Refetch schema" : "Fetch schema"}
            </button>
          </div>
        )
      }
    >
      {connections === null ? (
        <SchemaLoadingSkeleton />
      ) : loadError ? (
        <p className="text-sm text-danger">{loadError}</p>
      ) : connectedConnections.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="No connected databases"
          description="Add a connection and fire a successful demo query on the Connections page before its schema can be fetched here."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <AnimatePresence>
            {displayError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={ease}
                style={{ overflow: "hidden" }}
                className="flex items-start gap-2 rounded-lg bg-danger/5 px-3 py-2.5 text-xs text-danger"
              >
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{displayError}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {!snapshotChecked ? (
            <SchemaLoadingSkeleton />
          ) : !snapshot ? (
            <div className="flex flex-col items-center gap-4">
              <EmptyState
                icon={Code2}
                title="No schema fetched yet"
                description={`Fetch ${selectedConnection?.label ?? "this connection"}'s schema to see its tables, columns, relationships and indexes.`}
              />
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={fetching}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-4 text-sm font-medium text-paper transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
              >
                {fetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Fetch schema
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-2/60 px-3 py-2">
                <span className="flex items-center gap-2 text-xs text-muted">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                  </span>
                  <Clock className="h-3.5 w-3.5" />
                  <span className="font-mono">Saved · fetched {formatRelativeTime(snapshot.fetchedAt)}</span>
                </span>

                <div className="flex items-center gap-3">
                  <AnimatePresence>
                    {justFetched && (
                      <motion.span
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8, transition: { duration: 0.15 } }}
                        transition={ease}
                        className="flex items-center gap-1 text-xs font-medium text-success"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Schema saved for next time
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <button
                    type="button"
                    onClick={() => setShowQueries((v) => !v)}
                    className="flex items-center gap-1 text-xs font-medium text-ink-2 transition-colors hover:text-ink"
                  >
                    {showQueries ? "Hide" : "View"} SQL used
                    <ChevronDown
                      className={cn("h-3.5 w-3.5 transition-transform duration-200", showQueries && "rotate-180")}
                    />
                  </button>
                </div>
              </div>

              <AnimatePresence initial={false}>
                {showQueries && (
                  <motion.div
                    key="sql-panel"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={ease}
                    style={{ overflow: "hidden" }}
                  >
                    <SchemaQueriesPreview queries={snapshot.queries} />
                  </motion.div>
                )}
              </AnimatePresence>

              <SchemaCanvas key={snapshot.connectionId} tables={snapshot.tables} />
            </>
          )}
        </div>
      )}

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Fetch schema?">
        {selectedConnection && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-2">
              This opens a real, short-lived connection to{" "}
              <span className="font-mono font-medium text-ink">{selectedConnection.label}</span> (
              {selectedConnection.host}:{selectedConnection.port}) using the stored credentials,
              and runs exactly the read-only catalog queries below. Nothing else.
            </p>
            <SchemaQueriesPreview queries={SCHEMA_QUERIES[selectedConnection.engine]} />
            <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="text-sm font-medium text-muted transition-colors hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runFetch}
                className="inline-flex h-9 items-center rounded-lg bg-ink px-4 text-sm font-medium text-paper transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98]"
              >
                Fetch schema
              </button>
            </div>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
