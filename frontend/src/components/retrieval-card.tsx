"use client";

import { ChevronRight, Info, Layers, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { Panel, PanelHeader } from "./ui/page-shell";
import type { Retrieval, RetrievedTable } from "../lib/api";
import { cn } from "../lib/utils";

/** Dense is cosine similarity, BM25 an unbounded term sum: shown, never
 *  compared across arms. */
function score(value: number): string {
  return value.toFixed(3);
}

function ArmBadge({ arm, rank }: { arm: "dense" | "bm25"; rank: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px]",
        arm === "dense"
          ? "border-line bg-surface text-ink-2"
          : "border-marker/40 bg-marker/10 text-marker",
      )}
    >
      {arm} #{rank}
    </span>
  );
}

function TableRow({ table }: { table: RetrievedTable }) {
  const [open, setOpen] = useState(false);
  const bothArms = table.foundBy.length > 1;
  const qualified = table.schemaName
    ? `${table.schemaName}.${table.tableName}`
    : table.tableName;

  return (
    <div className="border-t border-line">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-3 text-left",
          "transition-colors hover:bg-surface-2/50",
        )}
      >
        <span
          className={cn(
            "grid h-6 w-6 shrink-0 place-items-center rounded-md border font-mono text-[11px]",
            table.finalRank === 1
              ? "border-marker/40 bg-marker/10 text-marker"
              : "border-line bg-surface text-muted",
          )}
        >
          {table.finalRank}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-mono text-[13px] text-ink">{qualified}</span>
            {bothArms && (
              <span className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] text-ink-2">
                both arms
              </span>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-1.5">
            {table.denseRank !== null && <ArmBadge arm="dense" rank={table.denseRank} />}
            {table.bm25Rank !== null && <ArmBadge arm="bm25" rank={table.bm25Rank} />}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="font-mono text-[13px] text-ink">{score(table.rerankScore)}</span>
          <span className="text-[10px] text-muted">rerank</span>
        </span>

        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-muted transition-transform duration-200",
            open && "rotate-90",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-t border-line bg-surface-2/30 px-4 py-3">
          <dl className="mb-3 flex flex-wrap gap-x-6 gap-y-1.5 font-mono text-[11px]">
            <span className="flex gap-1.5">
              <dt className="text-muted">dense</dt>
              <dd className="text-ink-2">
                {table.denseScore !== null ? score(table.denseScore) : "not in top results"}
              </dd>
            </span>
            <span className="flex gap-1.5">
              <dt className="text-muted">bm25</dt>
              <dd className="text-ink-2">
                {table.bm25Score !== null ? score(table.bm25Score) : "not in top results"}
              </dd>
            </span>
            <span className="flex gap-1.5">
              <dt className="text-muted">rerank</dt>
              <dd className="text-ink-2">{score(table.rerankScore)}</dd>
            </span>
          </dl>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-ink-2">
            {table.document}
          </pre>
        </div>
      )}
    </div>
  );
}

export function RetrievalCard({ retrieval }: { retrieval: Retrieval }) {
  const {
    denseQuery,
    keywordQuery,
    topKPerArm,
    rerankerModel,
    denseHitCount,
    bm25HitCount,
    candidateCount,
    tables,
    note,
  } = retrieval;

  return (
    <Panel>
      <PanelHeader>
        <span className="flex min-w-0 items-center gap-2">
          <span className="eyebrow shrink-0">Retrieval</span>
          <span className="truncate font-mono text-[11px] text-muted">
            {candidateCount} table{candidateCount === 1 ? "" : "s"} · reranked
          </span>
        </span>
        <span className="hidden shrink-0 font-mono text-[10px] text-muted sm:block">
          {rerankerModel}
        </span>
      </PanelHeader>

      {/* What each arm was asked, not just what it returned. */}
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="flex shrink-0 items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-muted" aria-hidden />
            <span className="eyebrow">dense</span>
          </span>
          <span className="min-w-0 flex-1 font-mono text-[12px] text-ink-2">{denseQuery}</span>
          <span className="shrink-0 font-mono text-[10px] text-muted">
            {denseHitCount}/{topKPerArm}
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="flex shrink-0 items-center gap-1.5">
            <Search className="h-3 w-3 text-muted" aria-hidden />
            <span className="eyebrow">bm25</span>
          </span>
          <span className="min-w-0 flex-1 font-mono text-[12px] text-ink-2">
            {keywordQuery || <span className="italic text-muted">no search terms</span>}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-muted">
            {bm25HitCount}/{topKPerArm}
          </span>
        </div>
      </div>

      {note && (
        <div className="flex items-start gap-2.5 border-t border-line bg-surface-2/40 px-4 py-3">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
          <p className="text-xs leading-relaxed text-muted">{note}</p>
        </div>
      )}

      {tables.length === 0 ? (
        <div className="flex flex-col items-center gap-2 border-t border-line px-6 py-10 text-center">
          <Layers className="h-5 w-5 text-muted" aria-hidden />
          <p className="text-sm text-muted">No tables matched this question.</p>
        </div>
      ) : (
        tables.map((table) => (
          <TableRow key={`${table.schemaName ?? ""}.${table.tableName}`} table={table} />
        ))
      )}
    </Panel>
  );
}
