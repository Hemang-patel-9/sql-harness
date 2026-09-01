"use client";

import { Check, Copy, Info, ShieldAlert, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { SqlBlock } from "./sql-block";
import { Panel, PanelHeader } from "./ui/page-shell";
import type { GeneratedSqlResult } from "../lib/api";
import { cn } from "../lib/utils";

export function GeneratedSqlCard({ sql }: { sql: GeneratedSqlResult }) {
  const [copied, setCopied] = useState(false);

  async function copySql() {
    try {
      await navigator.clipboard.writeText(sql.sql);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {}
  }

  return (
    <Panel>
      <PanelHeader>
        <span className="flex min-w-0 items-center gap-2">
          <span className="eyebrow shrink-0">Generated SQL</span>
          <span
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
              sql.isValid ? "bg-success-wash text-success" : "bg-danger/10 text-danger",
            )}
          >
            {sql.isValid ? <Check className="h-3 w-3" /> : <TriangleAlert className="h-3 w-3" />}
            {sql.isValid ? "Looks correct" : "Needs review"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="font-mono text-[10px] text-muted">{sql.dialect}</span>
          <button
            type="button"
            onClick={() => void copySql()}
            className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-2 hover:text-ink"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </span>
      </PanelHeader>

      <div className="border-t border-line">
        <SqlBlock sql={sql.sql} />
      </div>

      <div className="flex items-start gap-2.5 border-t border-line bg-surface-2/40 px-4 py-3">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
        <p className="text-xs leading-relaxed text-muted">{sql.explanation}</p>
      </div>

      {sql.criticNotes && (
        <p className="border-t border-line px-4 py-3 text-xs leading-relaxed text-ink-2">
          <span className="eyebrow mr-1.5">Review</span>
          {sql.criticNotes}
        </p>
      )}

      {sql.issues.length > 0 && (
        <ul className="flex flex-col gap-1.5 border-t border-line px-4 py-3">
          {sql.issues.map((issue, index) => (
            <li
              key={index}
              className={cn(
                "flex items-start gap-2 text-xs leading-relaxed",
                issue.severity === "error" ? "text-danger" : "text-marker",
              )}
            >
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-center gap-1.5 border-t border-line px-4 py-2.5 font-mono text-[10px] text-muted">
        <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden />
        Tables: {sql.tablesUsed.join(", ") || "none"} · not executed — read-only, for you to review
      </p>
    </Panel>
  );
}
