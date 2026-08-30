import { ArrowLeft, ArrowRight, Hash, KeyRound, Link2 } from "lucide-react";
import type { NormalizedTable } from "../../../lib/api";
import { cn } from "../../../lib/utils";

function Group({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line px-4 py-3.5 first:border-t-0">
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

/** The exact {table, columns, relationships, indexes} shape stored in
 * schema_objects.normalized_json, rendered for a human to check before it
 * feeds a later description-generation step. */
export function IngestTablePreview({ table }: { table: NormalizedTable }) {
  return (
    <div className="divide-y-0">
      <Group label="Columns" count={table.columns.length}>
        <ul className="flex flex-col gap-1.5">
          {table.columns.map((column) => (
            <li
              key={column.name}
              className="flex items-center gap-2 font-mono text-[12.5px] text-ink-2"
            >
              {column.isPrimaryKey ? (
                <KeyRound className="h-3 w-3 shrink-0 text-marker" aria-label="Primary key" />
              ) : column.isForeignKey ? (
                <Link2 className="h-3 w-3 shrink-0 text-muted" aria-label="Foreign key" />
              ) : (
                <span className="w-3 shrink-0" />
              )}
              <span className="text-ink">{column.name}</span>
              <span className="text-muted">{column.dataType}</span>
              {!column.nullable && <span className="text-[10px] text-muted">not null</span>}
            </li>
          ))}
        </ul>
      </Group>

      <Group label="Relationships" count={table.relationships.length}>
        {table.relationships.length === 0 ? (
          <p className="text-xs text-muted">No foreign keys, either direction.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {table.relationships.map((rel, i) => (
              <li
                key={`${rel.constraintName}-${i}`}
                className="flex items-center gap-2 font-mono text-[12.5px] text-ink-2"
              >
                {rel.direction === "outgoing" ? (
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted" aria-label="Outgoing" />
                ) : (
                  <ArrowLeft className="h-3 w-3 shrink-0 text-muted" aria-label="Incoming" />
                )}
                <span className={cn(rel.direction === "outgoing" ? "text-ink" : "text-muted")}>
                  {rel.table}({rel.columns.join(", ")})
                </span>
                <span className="text-muted">&rarr;</span>
                <span className={cn(rel.direction === "incoming" ? "text-ink" : "text-muted")}>
                  {rel.referencedTable}({rel.referencedColumns.join(", ")})
                </span>
              </li>
            ))}
          </ul>
        )}
      </Group>

      <Group label="Indexes" count={table.indexes.length}>
        {table.indexes.length === 0 ? (
          <p className="text-xs text-muted">No indexes.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {table.indexes.map((index) => (
              <li
                key={index.name}
                className="flex items-center gap-2 font-mono text-[12.5px] text-ink-2"
              >
                <Hash className="h-3 w-3 shrink-0 text-muted" />
                <span className="text-ink">{index.name}</span>
                <span className="text-muted">({index.columns.join(", ")})</span>
                {index.isPrimary && <span className="text-[10px] text-muted">primary</span>}
                {index.isUnique && !index.isPrimary && (
                  <span className="text-[10px] text-muted">unique</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Group>
    </div>
  );
}
