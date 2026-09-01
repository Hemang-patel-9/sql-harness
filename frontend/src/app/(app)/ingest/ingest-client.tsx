"use client";

import { AlertCircle, ChevronDown, Layers, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ApiError,
  getIngestStatus,
  listIngestConnections,
  listTableDocuments,
  pollJob,
  processIngest,
  startSyncTableDocuments,
  toSyncResult,
} from "../../../lib/api";
import type {
  DocumentListItem,
  IngestConnectionSummary,
  IngestResult,
  JobProgress,
  SyncAction,
  SyncResult,
  SyncResultPayload,
  TableDocument,
} from "../../../lib/api";
import { engineIcon } from "../../../components/ui/engine-select";
import { Button, ButtonLink } from "../../../components/ui/button";
import { JobProgressBar } from "../../../components/ui/job-progress";
import { EmptyState, Panel, PageShell } from "../../../components/ui/page-shell";
import { cn } from "../../../lib/utils";
import { IngestTablePreview } from "./ingest-table-preview";

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

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-surface-2", className)} />;
}

const SYNC_LABELS: Record<SyncAction, string> = {
  generated: "generated",
  regenerated: "regenerated",
  embedded: "re-embedded",
  unchanged: "unchanged",
  skipped_edited: "left alone (edited by hand)",
  failed: "failed",
};

const SYNC_ORDER: SyncAction[] = [
  "generated",
  "regenerated",
  "embedded",
  "unchanged",
  "skipped_edited",
  "failed",
];

function SyncSummary({ result }: { result: SyncResult }) {
  const parts = SYNC_ORDER.filter((a) => (result.counts[a] ?? 0) > 0).map(
    (a) => `${result.counts[a]} ${SYNC_LABELS[a]}`,
  );
  const attention = result.tables.filter(
    (t) => t.action === "failed" || t.action === "skipped_edited",
  );

  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-surface-2/60 px-3 py-2 text-xs">
      <span className="font-mono text-ink-2">{parts.join(" · ") || "nothing to do"}</span>
      {attention.map((t) => (
        <span key={`${t.schemaName}.${t.tableName}`} className="flex items-start gap-2 text-muted">
          <span className={cn("font-mono", t.action === "failed" ? "text-danger" : "text-marker")}>
            {t.tableName}
          </span>
          <span>{t.detail}</span>
        </span>
      ))}
    </div>
  );
}

function ConnectionDetail({
  connectionId,
  result,
  loading,
  error,
  documentList,
  documents,
  onDocumentChange,
}: {
  connectionId: string;
  result: IngestResult | undefined;
  loading: boolean;
  error: string | undefined;
  documentList: DocumentListItem[] | undefined;
  documents: Record<string, TableDocument> | undefined;
  onDocumentChange: (tableName: string, doc: TableDocument) => void;
}) {
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const tables = result?.tables ?? [];
  const active = tables.find((t) => t.table === selectedTable) ?? tables[0] ?? null;
  const listByTable = new Map((documentList ?? []).map((d) => [d.tableName, d]));

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 border-t border-line p-4 md:grid-cols-[200px_1fr]">
        <SkeletonBlock className="h-32" />
        <SkeletonBlock className="h-48" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 border-t border-line bg-danger/5 px-4 py-3 text-xs text-danger">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!result || tables.length === 0) {
    return (
      <p className="border-t border-line px-4 py-4 text-xs text-muted">
        Nothing processed yet for {connectionId}.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 border-t border-line md:grid-cols-[200px_1fr]">
      <ul className="flex flex-col gap-0.5 border-b border-line p-2 md:border-b-0 md:border-r">
        {tables.map((table) => {
          const docStatus = listByTable.get(table.table);
          return (
            <li key={table.table}>
              <button
                type="button"
                onClick={() => setSelectedTable(table.table)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-mono text-[12.5px] transition-colors",
                  active?.table === table.table
                    ? "bg-surface-2 text-ink"
                    : "text-ink-2 hover:bg-surface-2/60",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    docStatus?.isEmbedded && !docStatus.isStale
                      ? "bg-success"
                      : docStatus?.hasDocument
                        ? "bg-marker"
                        : "bg-line-strong",
                  )}
                />
                <span className="truncate">{table.table}</span>
                <span className="ml-auto shrink-0 text-[10px] text-muted">{table.columns.length}c</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="min-w-0">
        {active && (
          <IngestTablePreview
            table={active}
            connectionId={connectionId}
            listItem={listByTable.get(active.table)}
            tableDocument={documents?.[active.table]}
            onDocumentChange={(doc) => onDocumentChange(active.table, doc)}
          />
        )}
      </div>
    </div>
  );
}

export function IngestClient() {
  const [connections, setConnections] = useState<IngestConnectionSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processErrors, setProcessErrors] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailResults, setDetailResults] = useState<Record<string, IngestResult>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [documentLists, setDocumentLists] = useState<Record<string, DocumentListItem[]>>({});
  const [documents, setDocuments] = useState<Record<string, Record<string, TableDocument>>>({});
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<Record<string, SyncResult>>({});
  const [syncProgress, setSyncProgress] = useState<Record<string, JobProgress>>({});

  useEffect(() => {
    listIngestConnections()
      .then(setConnections)
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : "Could not load connections.");
        setConnections([]);
      });
  }, []);

  function toggleExpanded(connection: IngestConnectionSummary) {
    const next = expandedId === connection.connectionId ? null : connection.connectionId;
    setExpandedId(next);
    if (next && connection.isProcessed && !detailResults[next]) {
      loadDetail(next);
    }
  }

  async function loadDetail(connectionId: string) {
    setDetailLoadingId(connectionId);
    setDetailErrors((prev) => {
      const next = { ...prev };
      delete next[connectionId];
      return next;
    });
    try {
      const [result, documentList] = await Promise.all([
        getIngestStatus(connectionId),
        listTableDocuments(connectionId),
      ]);
      if (result) setDetailResults((prev) => ({ ...prev, [connectionId]: result }));
      setDocumentLists((prev) => ({ ...prev, [connectionId]: documentList }));
    } catch (err) {
      setDetailErrors((prev) => ({
        ...prev,
        [connectionId]: err instanceof ApiError ? err.message : "Could not load processed tables.",
      }));
    } finally {
      setDetailLoadingId((current) => (current === connectionId ? null : current));
    }
  }

  async function runSync(connectionId: string) {
    setSyncingId(connectionId);
    setProcessErrors((prev) => {
      const next = { ...prev };
      delete next[connectionId];
      return next;
    });
    try {
      const handle = await startSyncTableDocuments(connectionId);
      const payload = await pollJob<SyncResultPayload>(handle.jobId, (progress) =>
        setSyncProgress((prev) => ({ ...prev, [connectionId]: progress })),
      );
      const result = toSyncResult(payload);
      setSyncResults((prev) => ({ ...prev, [connectionId]: result }));
      const documentList = await listTableDocuments(connectionId);
      setDocumentLists((prev) => ({ ...prev, [connectionId]: documentList }));
      // Cached bodies are stale for anything sync rewrote; drop them so the
      // panel refetches whichever table is opened next.
      setDocuments((prev) => {
        const next = { ...prev };
        delete next[connectionId];
        return next;
      });
      setExpandedId(connectionId);
      if (!detailResults[connectionId]) await loadDetail(connectionId);
    } catch (err) {
      setProcessErrors((prev) => ({
        ...prev,
        [connectionId]: err instanceof ApiError ? err.message : "Could not sync documents.",
      }));
    } finally {
      setSyncingId((current) => (current === connectionId ? null : current));
      setSyncProgress((prev) => {
        const next = { ...prev };
        delete next[connectionId];
        return next;
      });
    }
  }

  function handleDocumentChange(connectionId: string, tableName: string, doc: TableDocument) {
    setDocuments((prev) => ({
      ...prev,
      [connectionId]: { ...prev[connectionId], [tableName]: doc },
    }));
    setDocumentLists((prev) => {
      const list = prev[connectionId] ?? [];
      const exists = list.some((d) => d.tableName === tableName);
      const item: DocumentListItem = {
        schemaName: doc.schemaName,
        tableName: doc.tableName,
        hasDocument: doc.hasDocument,
        isEmbedded: doc.isEmbedded,
        isStale: doc.isStale,
        staleReason: doc.staleReason,
        generatedAt: doc.generatedAt,
        embeddedAt: doc.embeddedAt,
      };
      return {
        ...prev,
        [connectionId]: exists ? list.map((d) => (d.tableName === tableName ? item : d)) : [...list, item],
      };
    });
  }

  async function runProcess(connection: IngestConnectionSummary) {
    const id = connection.connectionId;
    setProcessingId(id);
    setProcessErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const result = await processIngest(id);
      // Awaited, not fired-and-forgotten: the panel reads each table's
      // schema_name off this list, and acting without it targets the wrong row.
      const documentList = await listTableDocuments(id);
      setDetailResults((prev) => ({ ...prev, [id]: result }));
      setDocumentLists((prev) => ({ ...prev, [id]: documentList }));
      // Reprocessing can change a table's shape; drop cached documents so the
      // panel refetches and picks up any new staleness.
      setDocuments((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setConnections((prev) =>
        prev?.map((c) =>
          c.connectionId === id
            ? {
                ...c,
                isProcessed: true,
                processedAt: result.processedAt,
                processedTableCount: result.tableCount,
              }
            : c,
        ) ?? prev,
      );
      setExpandedId(id);
    } catch (err) {
      setProcessErrors((prev) => ({
        ...prev,
        [id]: err instanceof ApiError ? err.message : "Could not process this schema.",
      }));
    } finally {
      setProcessingId((current) => (current === id ? null : current));
    }
  }

  const withSnapshot = connections?.filter((c) => c.hasSnapshot) ?? [];

  return (
    <PageShell
      eyebrow={
        connections === null
          ? "Loading…"
          : `${withSnapshot.length} of ${connections.length} connection${connections.length === 1 ? "" : "s"} ready`
      }
      title="Ingest"
      description="Normalize a connection's last-fetched schema into one record per table — columns, relationships (both directions) and indexes — stored ready for a later description-generation step."
      actions={null}
    >
      {connections === null ? (
        <div className="flex flex-col gap-2">
          <SkeletonBlock className="h-16" />
          <SkeletonBlock className="h-16" />
        </div>
      ) : loadError ? (
        <p className="text-sm text-danger">{loadError}</p>
      ) : connections.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No connections yet"
          description="Add a connection on the Connections page before there's anything to process here."
        />
      ) : (
        <Panel>
          <ul className="divide-y divide-line">
            {connections.map((connection) => {
              const engine = engineIcon(connection.engine);
              const isProcessing = processingId === connection.connectionId;
              const isSyncing = syncingId === connection.connectionId;
              const isExpanded = expandedId === connection.connectionId;
              const processError = processErrors[connection.connectionId];
              const syncResult = syncResults[connection.connectionId];
              const activeSyncProgress = syncProgress[connection.connectionId];

              return (
                <li key={connection.connectionId}>
                  <div className="flex flex-col gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-surface-2/40">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          connection.isProcessed
                            ? "bg-success"
                            : connection.hasSnapshot
                              ? "bg-marker"
                              : "bg-line-strong",
                        )}
                      />

                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-[13px] font-medium text-ink">
                          {connection.label}
                        </span>
                        <span className="block truncate font-mono text-[11px] text-muted">
                          {connection.host}:{connection.port}
                        </span>
                      </span>

                      <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-muted">
                        <engine.icon className="h-3.5 w-3.5" style={{ color: engine.color }} aria-hidden />
                        {engine.label}
                      </span>

                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[11px] font-medium",
                          connection.isProcessed
                            ? "bg-success-wash text-success"
                            : connection.hasSnapshot
                              ? "text-ink-2"
                              : "text-muted",
                        )}
                      >
                        {connection.isProcessed
                          ? `Processed ${connection.processedAt ? formatRelativeTime(connection.processedAt) : ""}`
                          : connection.hasSnapshot
                            ? "Ready to process"
                            : "No schema fetched"}
                      </span>

                      <span className="flex shrink-0 items-center gap-1.5">
                        {connection.hasSnapshot ? (
                          <Button
                            variant={connection.isProcessed ? "secondary" : "primary"}
                            size="sm"
                            disabled={isProcessing}
                            onClick={() => runProcess(connection)}
                          >
                            {isProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {isProcessing
                              ? "Processing…"
                              : connection.isProcessed
                                ? "Reprocess"
                                : "Process"}
                          </Button>
                        ) : (
                          <ButtonLink href="/schema" variant="secondary" size="sm">
                            Fetch schema first
                          </ButtonLink>
                        )}

                        {connection.isProcessed && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={isSyncing || isProcessing}
                            onClick={() => runSync(connection.connectionId)}
                            title="Generate or embed only the tables that need it"
                          >
                            {isSyncing ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            {isSyncing ? "Syncing…" : "Sync documents"}
                          </Button>
                        )}

                        {connection.isProcessed && (
                          <button
                            type="button"
                            aria-label={isExpanded ? "Collapse" : "Expand"}
                            onClick={() => toggleExpanded(connection)}
                            className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                          >
                            <ChevronDown
                              className={cn(
                                "h-3.5 w-3.5 transition-transform duration-200",
                                isExpanded && "rotate-180",
                              )}
                            />
                          </button>
                        )}
                      </span>
                    </div>

                    {processError && (
                      <div className="flex items-start gap-2 rounded-lg bg-danger/5 px-3 py-2 text-xs text-danger">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{processError}</span>
                      </div>
                    )}

                    {isSyncing && activeSyncProgress && <JobProgressBar progress={activeSyncProgress} />}

                    {syncResult && !isSyncing && <SyncSummary result={syncResult} />}
                  </div>

                  {isExpanded && (
                    <ConnectionDetail
                      connectionId={connection.connectionId}
                      result={detailResults[connection.connectionId]}
                      loading={detailLoadingId === connection.connectionId}
                      error={detailErrors[connection.connectionId]}
                      documentList={documentLists[connection.connectionId]}
                      documents={documents[connection.connectionId]}
                      onDocumentChange={(tableName, doc) =>
                        handleDocumentChange(connection.connectionId, tableName, doc)
                      }
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </PageShell>
  );
}
