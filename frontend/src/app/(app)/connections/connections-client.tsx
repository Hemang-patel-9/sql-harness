"use client";

import {
  CheckCircle2,
  Loader2,
  Pencil,
  Plug,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  ApiError,
  deleteConnection,
  listConnections,
  testConnection,
} from "../../../lib/api";
import type { Connection, ConnectionTestResult } from "../../../lib/api";
import { engineIcon } from "../../../components/ui/engine-select";
import { EmptyState, Panel, PageShell } from "../../../components/ui/page-shell";
import { Modal } from "../../../components/ui/modal";
import { ConnectionForm } from "./connection-form";
import { DemoQueryPreview } from "./demo-query";
import { cn } from "../../../lib/utils";

type FormModalState = { mode: "create" } | { mode: "edit"; connection: Connection } | null;

export function ConnectionsClient() {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formModal, setFormModal] = useState<FormModalState>(null);
  const [confirmFireId, setConfirmFireId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, ConnectionTestResult>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    listConnections()
      .then(setConnections)
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : "Could not load connections.");
        setConnections([]);
      });
  }, []);

  function handleSaved(saved: Connection) {
    setConnections((prev) => {
      if (!prev) return prev;
      const exists = prev.some((c) => c.id === saved.id);
      return exists ? prev.map((c) => (c.id === saved.id ? saved : c)) : [saved, ...prev];
    });
    // The edit (or create) invalidates any previous test result for this row.
    setTestResults((prev) => {
      if (!(saved.id in prev)) return prev;
      const next = { ...prev };
      delete next[saved.id];
      return next;
    });
    setFormModal(null);
  }

  async function fireDemoQuery(id: string) {
    setTestingId(id);
    try {
      const result = await testConnection(id);
      setTestResults((prev) => ({ ...prev, [id]: result }));
      setConnections((prev) =>
        prev?.map((c) =>
          c.id === id
            ? {
                ...c,
                status: result.ok ? "connected" : "failed",
                lastTestOk: result.ok,
                lastTestDetail: result.detail,
                lastTestedAt: new Date().toISOString(),
              }
            : c,
        ) ?? prev,
      );
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Could not run the test.";
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, detail: message, currentUser: null, currentDatabase: null, tableCount: null, latencyMs: null },
      }));
    } finally {
      setTestingId(null);
    }
  }

  async function confirmDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteConnection(id);
      setConnections((prev) => prev?.filter((c) => c.id !== id) ?? prev);
      setTestResults((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch {
      // leave the row in place; the user can retry
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  const reachable = connections?.filter((c) => c.status === "connected").length ?? 0;
  const total = connections?.length ?? 0;
  const firingConnection = connections?.find((c) => c.id === confirmFireId) ?? null;

  return (
    <PageShell
      eyebrow={connections ? `${reachable} connected · ${total - reachable} not connected` : "Loading…"}
      title="Connections"
      description="Databases this workspace can query. Credentials are encrypted at rest and only decrypted in memory to test a connection."
      actions={
        <button
          type="button"
          onClick={() => setFormModal({ mode: "create" })}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3.5 text-sm font-medium text-paper",
            "transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.97]",
          )}
        >
          <Plus className="h-4 w-4" />
          Add connection
        </button>
      }
    >
      {connections === null ? (
        <p className="text-sm text-muted">Loading connections…</p>
      ) : loadError ? (
        <p className="text-sm text-red-500">{loadError}</p>
      ) : connections.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="No data available"
          description="Add a database connection to query it from this workspace."
        />
      ) : (
        <Panel>
          <ul className="divide-y divide-line">
            {connections.map((connection) => {
              const result = testResults[connection.id];
              const isTesting = testingId === connection.id;
              const isConfirmingDelete = confirmDeleteId === connection.id;
              const isDeleting = deletingId === connection.id;
              const engine = engineIcon(connection.engine);

              return (
                <li key={connection.id} className="flex flex-col gap-3 px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span
                      aria-hidden
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        connection.status === "connected" && "bg-success",
                        connection.status === "untested" && "bg-line-strong",
                        connection.status === "failed" && "bg-danger",
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
                        "rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                        connection.status === "connected" ? "bg-success-wash text-success" : "text-muted",
                        connection.status === "failed" && "text-danger",
                      )}
                    >
                      {connection.status === "untested" ? "Not tested" : connection.status}
                    </span>

                    {isConfirmingDelete ? (
                      <span className="flex shrink-0 items-center gap-2 text-xs">
                        <span className="text-muted">Delete this connection?</span>
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => confirmDelete(connection.id)}
                          className="font-medium text-danger hover:underline disabled:opacity-50"
                        >
                          {isDeleting ? "Deleting…" : "Confirm"}
                        </button>
                        <button
                          type="button"
                          disabled={isDeleting}
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-muted hover:text-ink"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirmFireId(connection.id)}
                          disabled={isTesting}
                          className={cn(
                            "inline-flex h-8 items-center gap-1.5 rounded-lg bg-surface-2 px-3 text-xs font-medium text-ink-2",
                            "transition-colors hover:bg-line hover:text-ink disabled:pointer-events-none disabled:opacity-60",
                          )}
                        >
                          {isTesting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          {isTesting ? "Testing…" : "Fire demo query"}
                        </button>
                        <button
                          type="button"
                          aria-label={`Edit ${connection.label}`}
                          onClick={() => setFormModal({ mode: "edit", connection })}
                          className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${connection.label}`}
                          onClick={() => setConfirmDeleteId(connection.id)}
                          className="grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-red-500/10 hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    )}
                  </div>

                  {!result && <DemoQueryPreview engine={connection.engine} />}

                  {result && (
                    <div
                      className={cn(
                        "flex items-start gap-2 rounded-lg px-3 py-2 text-xs",
                        result.ok ? "bg-success-wash text-success" : "bg-red-500/5 text-red-500",
                      )}
                    >
                      {result.ok ? (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      )}
                      {result.ok ? (
                        <span className="font-mono">
                          user={result.currentUser} · db={result.currentDatabase} · tables=
                          {result.tableCount} · {result.latencyMs}ms
                        </span>
                      ) : (
                        <span>{result.detail}</span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <Modal
        open={formModal !== null}
        onClose={() => setFormModal(null)}
        title={formModal?.mode === "edit" ? "Edit connection" : "Add connection"}
      >
        {formModal && (
          <ConnectionForm
            mode={formModal.mode}
            connection={formModal.mode === "edit" ? formModal.connection : undefined}
            onSaved={handleSaved}
            onCancel={() => setFormModal(null)}
          />
        )}
      </Modal>

      <Modal open={firingConnection !== null} onClose={() => setConfirmFireId(null)} title="Fire demo query?">
        {firingConnection && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-2">
              This opens a real, short-lived connection to{" "}
              <span className="font-mono font-medium text-ink">{firingConnection.label}</span> (
              {firingConnection.host}:{firingConnection.port}) using the stored credentials, and
              runs exactly the query below. Nothing else.
            </p>
            <DemoQueryPreview engine={firingConnection.engine} />
            <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
              <button
                type="button"
                onClick={() => setConfirmFireId(null)}
                className="text-sm font-medium text-muted transition-colors hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = firingConnection.id;
                  setConfirmFireId(null);
                  fireDemoQuery(id);
                }}
                className={cn(
                  "inline-flex h-9 items-center rounded-lg bg-ink px-4 text-sm font-medium text-paper",
                  "transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98]",
                )}
              >
                Run this query
              </button>
            </div>
          </div>
        )}
      </Modal>
    </PageShell>
  );
}
