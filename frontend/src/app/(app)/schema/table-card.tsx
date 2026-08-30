"use client";

import { Eye, GripVertical, Hash, KeyRound, Link2, Table2 } from "lucide-react";
import { motion } from "motion/react";
import {
  INDEX_FOOTER_HEIGHT,
  MAX_VISIBLE_ROWS,
  ROW_HEIGHT,
  nonPrimaryIndexes,
  typeColor,
  type Positioned,
} from "./schema-layout";
import { cn } from "../../../lib/utils";

export function TableCard({
  pos,
  accent,
  index,
  dimmed,
  selected,
  moved,
  /** Columns at either end of the relationship currently being traced. */
  litColumns,
  onSelect,
}: {
  pos: Positioned;
  /** The table's identity hue, resolved so no neighbour shares it. */
  accent: string;
  index: number;
  dimmed: boolean;
  selected: boolean;
  /** True once the table has been dragged off its computed position. */
  moved: boolean;
  litColumns: Set<string> | null;
  /** Keyboard path to selection; the pointer path lives on the viewport. */
  onSelect: (name: string) => void;
}) {
  const { table } = pos;
  const displayIndexes = nonPrimaryIndexes(table);
  const bodyHeight = Math.min(table.columns.length, MAX_VISIBLE_ROWS) * ROW_HEIGHT;
  const isView = table.tableType !== "table";

  return (
    // The outer element owns the one-time mount entrance and never
    // re-animates. The inner card owns dimming and selection, transitioned
    // with plain CSS so it never fights the mount animation's inline opacity.
    <motion.div
      data-table-card
      data-table-name={table.name}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(table.name);
        }
      }}
      initial={{ opacity: 0, scale: 0.92, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        duration: 0.32,
        delay: Math.min(index * 0.02, 0.4),
        ease: [0.22, 1, 0.36, 1],
      }}
      style={{ left: pos.x, top: pos.y, width: pos.width }}
      className="group absolute cursor-grab text-left active:cursor-grabbing"
    >
      <div
        style={selected ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}` } : undefined}
        className={cn(
          "flex flex-col overflow-hidden rounded-lg border bg-surface",
          "transition-[opacity,border-color,box-shadow] duration-200",
          "[box-shadow:var(--elev-inset),var(--elev-2)]",
          selected ? "border-transparent" : "border-line",
          dimmed && "opacity-25",
        )}
      >
        {/* Identity bar. The same hue leaves this table on every join. */}
        <div style={{ backgroundColor: accent }} className="h-[3px] w-full" aria-hidden />

        <div className="flex items-center gap-1.5 border-b border-line bg-surface-2 px-2.5 py-2">
          {isView ? (
            <Eye className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} />
          ) : (
            <Table2 className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} />
          )}

          <span className="min-w-0 flex-1">
            <span className="block truncate font-mono text-[12.5px] font-semibold text-ink">
              {table.schemaName && table.schemaName !== "public" ? `${table.schemaName}.` : ""}
              {table.name}
            </span>
          </span>

          {moved && (
            <span
              title="Moved from the automatic layout"
              className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100"
            >
              <GripVertical className="h-3 w-3" />
            </span>
          )}

          {table.approxRowCount !== null && (
            <span className="tabular shrink-0 font-mono text-[10px] text-muted">
              ~{table.approxRowCount.toLocaleString()}
            </span>
          )}
        </div>

        <div style={{ height: bodyHeight }} className="overflow-y-auto">
          {table.columns.map((column) => {
            const lit = litColumns?.has(column.name) ?? false;
            return (
              <div
                key={column.name}
                title={`${column.name} · ${column.dataType}${
                  column.nullable ? "" : " NOT NULL"
                }${column.default ? ` · default ${column.default}` : ""}`}
                style={{ height: ROW_HEIGHT }}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 text-[11.5px] transition-colors",
                  lit && "bg-wash",
                )}
              >
                <span className="grid h-3 w-3 shrink-0 place-items-center">
                  {column.isPrimaryKey ? (
                    <KeyRound className="h-3 w-3 text-marker" />
                  ) : column.isForeignKey ? (
                    <Link2 className="h-3 w-3" style={{ color: accent }} />
                  ) : null}
                </span>

                <span
                  className={cn(
                    "min-w-0 flex-1 truncate font-mono",
                    column.isPrimaryKey ? "font-medium text-ink" : "text-ink-2",
                  )}
                >
                  {column.name}
                </span>

                <span
                  style={{ color: typeColor(column.dataType) }}
                  className="shrink-0 truncate font-mono text-[10.5px] opacity-90"
                >
                  {column.dataType}
                  {!column.nullable && <span className="text-marker">*</span>}
                </span>
              </div>
            );
          })}
        </div>

        {displayIndexes.length > 0 && (
          <div
            title={displayIndexes
              .map((i) => `${i.isUnique ? "unique" : "index"} ${i.name} (${i.columns.join(", ")})`)
              .join("\n")}
            style={{ height: INDEX_FOOTER_HEIGHT }}
            className="flex items-center gap-1.5 border-t border-line px-2.5 text-[10.5px] text-muted"
          >
            <Hash className="h-3 w-3 shrink-0" />
            <span className="truncate">{displayIndexes.map((i) => i.name).join(" · ")}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
