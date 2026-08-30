"use client";

import { Check, Copy, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ApiError,
  editTableDocument,
  generateTableDocument,
  getTableDocument,
  ingestTableDocument,
  type DocumentListItem,
  type TableDocument,
} from "../../../lib/api";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";

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

const STALE_COPY: Record<string, string> = {
  schema_changed: "The table's structure changed since this was generated.",
  document_changed: "This document changed since it was last embedded.",
};

type Action = "load" | "generate" | "save" | "ingest" | null;

export function IngestDocumentPanel({
  connectionId,
  schemaName,
  tableName,
  listItem,
  cached,
  onChange,
}: {
  connectionId: string;
  schemaName: string | null;
  tableName: string;
  listItem: DocumentListItem | undefined;
  cached: TableDocument | undefined;
  onChange: (doc: TableDocument) => void;
}) {
  const [action, setAction] = useState<Action>(cached || !listItem?.hasDocument ? null : "load");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (cached || !listItem?.hasDocument) return;
    getTableDocument(connectionId, tableName, schemaName)
      .then((doc) => {
        if (doc) onChange(doc);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the document."))
      .finally(() => setAction((current) => (current === "load" ? null : current)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runGenerate() {
    setConfirmRegenerate(false);
    setAction("generate");
    setError(null);
    try {
      const doc = await generateTableDocument(connectionId, tableName, schemaName);
      onChange(doc);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate a document for this table.");
    } finally {
      setAction((current) => (current === "generate" ? null : current));
    }
  }

  async function runSave() {
    setAction("save");
    setError(null);
    try {
      const doc = await editTableDocument(connectionId, tableName, schemaName, draft);
      onChange(doc);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your edit.");
    } finally {
      setAction((current) => (current === "save" ? null : current));
    }
  }

  async function runIngest() {
    setAction("ingest");
    setError(null);
    try {
      await ingestTableDocument(connectionId, tableName, schemaName);
      const doc = await getTableDocument(connectionId, tableName, schemaName);
      if (doc) onChange(doc);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not embed this document.");
    } finally {
      setAction((current) => (current === "ingest" ? null : current));
    }
  }

  async function copyDocument() {
    if (!cached) return;
    try {
      await navigator.clipboard.writeText(cached.document);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Your browser blocked the clipboard. Select the text and copy it.");
    }
  }

  // listItem carries this table's schema_name; without it every call would
  // target schema_name=NULL and miss the row.
  const busy = action !== null || listItem === undefined;

  return (
    <section className="border-t border-line px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow flex items-center gap-2">
          Description
          {cached?.criticScore != null && (
            <span className="tabular rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
              {cached.criticScore}/10
            </span>
          )}
        </p>

        <div className="flex items-center gap-1.5">
          {cached?.hasDocument && (
            <button
              type="button"
              onClick={() => void copyDocument()}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium",
                "text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink",
              )}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          )}

          {cached?.hasDocument && !editing && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => {
                setDraft(cached.document);
                setEditing(true);
              }}
            >
              Edit
            </Button>
          )}

          {cached?.hasDocument && (
            <Button
              variant={cached.isEmbedded ? "secondary" : "primary"}
              size="sm"
              disabled={busy || editing}
              onClick={() => void runIngest()}
            >
              {action === "ingest" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {action === "ingest" ? "Embedding…" : cached.isEmbedded ? "Re-ingest" : "Ingest to vector DB"}
            </Button>
          )}

          {confirmRegenerate ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-muted">Discard the current document?</span>
              <button
                type="button"
                onClick={() => void runGenerate()}
                className="font-medium text-danger hover:underline"
              >
                Regenerate
              </button>
              <button
                type="button"
                onClick={() => setConfirmRegenerate(false)}
                className="text-muted hover:text-ink"
              >
                Cancel
              </button>
            </span>
          ) : (
            <Button
              variant={cached?.hasDocument ? "secondary" : "primary"}
              size="sm"
              disabled={busy}
              onClick={() => (cached?.hasDocument ? setConfirmRegenerate(true) : void runGenerate())}
            >
              {action === "generate" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {action === "generate" ? "Generating…" : cached?.hasDocument ? "Regenerate" : "Generate"}
            </Button>
          )}
        </div>
      </div>

      {error && <p className="mt-2.5 text-xs text-danger">{error}</p>}

      {cached?.isStale && !editing && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-marker/10 px-3 py-2 text-xs text-ink-2">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-marker" />
          <span>{cached.staleReason ? STALE_COPY[cached.staleReason] : "This document may be out of date."}</span>
        </div>
      )}

      {action === "load" ? (
        <div className="mt-3 h-32 animate-pulse rounded-lg bg-surface-2" />
      ) : editing && cached ? (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={16}
            className={cn(
              "w-full resize-y rounded-lg border border-line bg-surface px-3.5 py-3",
              "font-mono text-[12.5px] leading-relaxed text-ink outline-none",
              "focus-visible:border-line-strong",
            )}
          />
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy || draft.trim().length === 0} onClick={() => void runSave()}>
              {action === "save" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {action === "save" ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : cached?.hasDocument ? (
        <pre className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-ink-2">
          {cached.document}
        </pre>
      ) : (
        <p className="mt-3 text-xs text-muted">
          No document yet. Generate one from this table&apos;s columns, relationships, and indexes.
        </p>
      )}

      {cached?.hasDocument && !editing && (
        <p className="mt-3 font-mono text-[11px] text-muted">
          {cached.generatedAt && `Generated ${formatRelativeTime(cached.generatedAt)}`}
          {cached.embeddedAt ? ` · Embedded ${formatRelativeTime(cached.embeddedAt)}` : " · Not embedded yet"}
        </p>
      )}
    </section>
  );
}
