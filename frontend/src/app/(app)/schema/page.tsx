import type { Metadata } from "next";
import { Database, KeyRound } from "lucide-react";
import {
  EmptyState,
  Panel,
  PanelHeader,
  PageShell,
} from "../../../components/ui/page-shell";

export const metadata: Metadata = { title: "Schema" };

interface Table {
  name: string;
  rows: string;
  columns: { name: string; type: string; key?: boolean }[];
}

const TABLES: Table[] = [];

export default function SchemaPage() {
  const columnCount = TABLES.reduce(
    (total, table) => total + table.columns.length,
    0,
  );

  return (
    <PageShell
      eyebrow={`${TABLES.length} tables · ${columnCount} columns`}
      title="Schema"
      description="The tables the translator can see. Anything not listed here is out of scope."
    >
      {TABLES.length === 0 ? (
        <EmptyState
          icon={Database}
          title="No data available"
          description="Connect a database to see its tables and columns here."
        />
      ) : (
        <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TABLES.map((table) => (
            <Panel key={table.name}>
              <PanelHeader>
                <span className="font-mono text-[13px] font-medium text-ink">
                  {table.name}
                </span>
                <span className="font-mono text-[11px] text-muted">
                  {table.rows}
                </span>
              </PanelHeader>
              <ul className="divide-y divide-line">
                {table.columns.map((column) => (
                  <li
                    key={column.name}
                    className="flex items-center justify-between gap-3 px-4 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      {column.key && (
                        <KeyRound
                          aria-label="Key column"
                          className="h-3 w-3 shrink-0 text-muted"
                        />
                      )}
                      <span className="truncate font-mono text-xs text-ink-2">
                        {column.name}
                      </span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-muted">
                      {column.type}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      )}
    </PageShell>
  );
}
