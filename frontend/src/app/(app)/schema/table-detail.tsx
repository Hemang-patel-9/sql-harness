"use client";

import { Check, Copy, Crosshair, Eye, Hash, KeyRound, Link2, Table2, X } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import type { SchemaTable } from "../../../lib/api";
import { accentToken, typeColor } from "./schema-layout";
import { ease } from "../../../lib/motion";
import { cn } from "../../../lib/utils";

/**
 * Reconstructs the table's shape as DDL. It is a faithful reading of the
 * catalog we fetched, not a migration: types are echoed as the server
 * reported them, and anything we did not collect (checks, collations,
 * generated columns) is simply absent.
 */
function toCreateTable(table: SchemaTable): string {
  const qualified =
    table.schemaName && table.schemaName !== "public"
      ? `${table.schemaName}.${table.name}`
      : table.name;

  const lines = table.columns.map((column) => {
    const parts = [`  ${column.name}`, column.dataType];
    if (!column.nullable) parts.push("NOT NULL");
    if (column.default) parts.push(`DEFAULT ${column.default}`);
    return parts.join(" ");
  });

  if (table.primaryKey.length > 0) {
    lines.push(`  PRIMARY KEY (${table.primaryKey.join(", ")})`);
  }

  for (const fk of table.foreignKeys) {
    const clauses = [
      `  CONSTRAINT ${fk.constraintName} FOREIGN KEY (${fk.columns.join(", ")})`,
      `REFERENCES ${fk.referencedTable} (${fk.referencedColumns.join(", ")})`,
    ];
    if (fk.onDelete) clauses.push(`ON DELETE ${fk.onDelete}`);
    if (fk.onUpdate) clauses.push(`ON UPDATE ${fk.onUpdate}`);
    lines.push(clauses.join(" "));
  }

  return `CREATE TABLE ${qualified} (\n${lines.join(",\n")}\n);`;
}

function Group({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-3.5">
      <p className="eyebrow flex items-center gap-2">
        {label}
        <span className="tabular rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
          {count}
        </span>
      </p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function TableDetail({
  table,
  accents,
  isolated,
  onIsolate,
  onClose,
}: {
  table: SchemaTable;
  accents: Map<string, string>;
  isolated: boolean;
  onIsolate: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const accent = accents.get(table.name) ?? accentToken(0);
  const isView = table.tableType !== "table";

  async function copyDdl() {
    try {
      await navigator.clipboard.writeText(toCreateTable(table));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the button simply does not confirm */
    }
  }

  return (
    <motion.aside
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={ease}
      data-canvas-overlay
      aria-label={`${table.name} details`}
      className={cn(
        "panel-float absolute bottom-3 right-3 top-3 z-20 flex w-[19rem] flex-col",
        "overflow-hidden rounded-xl",
      )}
    >
      <div style={{ backgroundColor: accent }} className="h-[3px] w-full shrink-0" aria-hidden />

      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface-2 px-4 py-3">
        {isView ? (
          <Eye className="h-4 w-4 shrink-0" style={{ color: accent }} />
        ) : (
          <Table2 className="h-4 w-4 shrink-0" style={{ color: accent }} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[13px] font-semibold text-ink">
            {table.name}
          </span>
          <span className="block truncate font-mono text-[10px] text-muted">
            {table.schemaName ?? "public"} · {isView ? "view" : "table"}
            {table.approxRowCount !== null && ` · ~${table.approxRowCount.toLocaleString()} rows`}
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-surface-3 hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 border-b border-line px-3 py-2">
        <button
          type="button"
          onClick={onIsolate}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium",
            "transition-colors",
            isolated ? "bg-wash text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
          )}
        >
          <Crosshair className="h-3.5 w-3.5" />
          {isolated ? "Isolated" : "Isolate"}
        </button>
        <button
          type="button"
          onClick={() => void copyDdl()}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium",
            "text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink",
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy DDL"}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Group label="Columns" count={table.columns.length}>
          <ul className="flex flex-col">
            {table.columns.map((column) => (
              <li key={column.name} className="flex items-baseline gap-1.5 py-1">
                <span className="grid h-3 w-3 shrink-0 translate-y-0.5 place-items-center">
                  {column.isPrimaryKey ? (
                    <KeyRound className="h-3 w-3 text-marker" />
                  ) : column.isForeignKey ? (
                    <Link2 className="h-3 w-3" style={{ color: accent }} />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[11.5px] text-ink">
                    {column.name}
                  </span>
                  {column.default && (
                    <span className="block truncate font-mono text-[10px] text-muted">
                      default {column.default}
                    </span>
                  )}
                </span>
                <span
                  style={{ color: typeColor(column.dataType) }}
                  className="shrink-0 font-mono text-[10px]"
                >
                  {column.dataType}
                  {!column.nullable && <span className="text-marker">*</span>}
                </span>
              </li>
            ))}
          </ul>
        </Group>

        {table.foreignKeys.length > 0 && (
          <Group label="Foreign keys" count={table.foreignKeys.length}>
            <ul className="flex flex-col gap-2.5">
              {table.foreignKeys.map((fk) => (
                <li key={fk.constraintName} className="font-mono text-[10.5px]">
                  <span className="block truncate text-ink-2">
                    {fk.columns.join(", ")}{" "}
                    <span className="text-muted">→</span>{" "}
                    <span style={{ color: accents.get(fk.referencedTable) }}>
                      {fk.referencedTable}
                    </span>
                    .{fk.referencedColumns.join(", ")}
                  </span>
                  <span className="block truncate text-muted">
                    {fk.constraintName}
                    {fk.onDelete && ` · on delete ${fk.onDelete.toLowerCase()}`}
                    {fk.onUpdate && ` · on update ${fk.onUpdate.toLowerCase()}`}
                  </span>
                </li>
              ))}
            </ul>
          </Group>
        )}

        {table.indexes.length > 0 && (
          <Group label="Indexes" count={table.indexes.length}>
            <ul className="flex flex-col gap-2">
              {table.indexes.map((index) => (
                <li key={index.name} className="font-mono text-[10.5px]">
                  <span className="flex items-center gap-1.5">
                    <Hash className="h-3 w-3 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate text-ink-2">{index.name}</span>
                    {index.isPrimary ? (
                      <span className="shrink-0 rounded bg-wash px-1 text-[9px] text-ink">pk</span>
                    ) : index.isUnique ? (
                      <span className="shrink-0 rounded bg-surface-2 px-1 text-[9px] text-muted">
                        unique
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate pl-4.5 text-muted">
                    {index.columns.join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          </Group>
        )}
      </div>
    </motion.aside>
  );
}
