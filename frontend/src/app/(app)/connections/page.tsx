import type { Metadata } from "next";
import { Panel, PageShell } from "../../../components/ui/page-shell";
import { cn } from "../../../lib/utils";

export const metadata: Metadata = { title: "Connections" };

const CONNECTIONS = [
  {
    name: "analytics-prod",
    engine: "PostgreSQL 16",
    host: "analytics.internal:5432",
    state: "In use",
    tone: "active" as const,
  },
  {
    name: "warehouse",
    engine: "Snowflake",
    host: "hb-1042.snowflakecomputing.com",
    state: "Connected",
    tone: "ok" as const,
  },
  {
    name: "billing-replica",
    engine: "PostgreSQL 15",
    host: "billing-ro.internal:5432",
    state: "Unreachable",
    tone: "down" as const,
  },
];

export default function ConnectionsPage() {
  const reachable = CONNECTIONS.filter((c) => c.tone !== "down").length;

  return (
    <PageShell
      eyebrow={`${reachable} reachable · ${CONNECTIONS.length - reachable} down`}
      title="Connections"
      description="Databases this workspace can query. The one in use sets the schema."
    >
      <Panel>
        <ul className="divide-y divide-line">
          {CONNECTIONS.map((connection) => (
            <li
              key={connection.name}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5"
            >
              <span
                aria-hidden
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  connection.tone === "active" && "bg-marker",
                  connection.tone === "ok" && "bg-line-strong",
                  connection.tone === "down" && "bg-danger",
                )}
              />

              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[13px] font-medium text-ink">
                  {connection.name}
                </span>
                <span className="block truncate font-mono text-[11px] text-muted">
                  {connection.host}
                </span>
              </span>

              <span className="font-mono text-[11px] text-muted">
                {connection.engine}
              </span>

              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  connection.tone === "active"
                    ? "bg-wash text-ink"
                    : "text-muted",
                )}
              >
                {connection.state}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </PageShell>
  );
}
